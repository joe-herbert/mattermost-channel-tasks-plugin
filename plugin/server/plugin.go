package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/mattermost/mattermost-server/v6/model"
	"github.com/mattermost/mattermost-server/v6/plugin"
)

const (
	botUsername    = "ChannelTasks"
	botDisplayName = "Channel Tasks"
	botDescription = "A bot that sends daily task reminders."
)

type Plugin struct {
	plugin.MattermostPlugin
	configurationLock sync.RWMutex
	botUserID         string
}

type TaskItem struct {
	ID          string     `json:"id"`
	Text        string     `json:"text"`
	Notes       string     `json:"notes"`
	Completed   bool       `json:"completed"`
	AssigneeIDs []string   `json:"assignee_ids,omitempty"`
	GroupID     string     `json:"group_id,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	CompletedAt time.Time  `json:"completed_at,omitempty"`
	Deadline    *time.Time `json:"deadline,omitempty"`
}

type TaskGroup struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Order string `json:"order,omitempty"`
}

type ChannelTaskList struct {
	Items           []TaskItem  `json:"items"`
	Groups          []TaskGroup `json:"groups"`
	HasEverHadTasks bool        `json:"has_ever_had_tasks"`
}

type UserDailyPrefs struct {
	Enabled         bool   `json:"enabled"`
	LastMessageDate string `json:"last_message_date"`
}

type TaskWithContext struct {
	Task        TaskItem
	GroupName   string
	ChannelID   string
	ChannelName string
	IsPrivate   bool
}

func (p *Plugin) OnActivate() error {
	botUserID, err := p.ensureBot()
	if err != nil {
		return fmt.Errorf("failed to ensure bot: %w", err)
	}
	p.botUserID = botUserID

	if err := p.API.RegisterCommand(&model.Command{
		Trigger:          "tasks-message-on",
		AutoComplete:     true,
		AutoCompleteDesc: "Enable daily task reminders",
	}); err != nil {
		return fmt.Errorf("failed to register tasks-message-on command: %w", err)
	}

	if err := p.API.RegisterCommand(&model.Command{
		Trigger:          "tasks-message-off",
		AutoComplete:     true,
		AutoCompleteDesc: "Disable daily task reminders",
	}); err != nil {
		return fmt.Errorf("failed to register tasks-message-off command: %w", err)
	}

	if err := p.API.RegisterCommand(&model.Command{
		Trigger:          "tasks-message-reset",
		AutoComplete:     true,
		AutoCompleteDesc: "Reset daily task reminder",
	}); err != nil {
		return fmt.Errorf("failed to register tasks-message-reset command: %w", err)
	}

	return nil
}

func (p *Plugin) ensureBot() (string, error) {
	bot, _ := p.API.GetUserByUsername(botUsername)
	if bot != nil {
		if _, err := p.API.PatchBot(bot.Id, &model.BotPatch{
			DisplayName: model.NewString(botDisplayName),
			Description: model.NewString(botDescription),
		}); err != nil {
			p.API.LogWarn("Failed to patch bot", "error", err.Error())
		}
		bot.FirstName = botDisplayName
		bot.LastName = ""
		bot.Nickname = botDisplayName
		if _, err := p.API.UpdateUser(bot); err != nil {
			p.API.LogWarn("Failed to update bot user", "error", err.Error())
		}
		return bot.Id, nil
	}

	createdBot, appErr := p.API.CreateBot(&model.Bot{
		Username:    botUsername,
		DisplayName: botDisplayName,
		Description: botDescription,
	})
	if appErr != nil {
		return "", fmt.Errorf("failed to create bot: %s", appErr.Error())
	}

	botUser, err := p.API.GetUser(createdBot.UserId)
	if err == nil && botUser != nil {
		botUser.FirstName = botDisplayName
		botUser.LastName = ""
		botUser.Nickname = botDisplayName
		if _, updateErr := p.API.UpdateUser(botUser); updateErr != nil {
			p.API.LogWarn("Failed to update new bot user", "error", updateErr.Error())
		}
	}

	if iconBytes, err := GetBotIconBytes(); err == nil {
		if setErr := p.API.SetProfileImage(createdBot.UserId, iconBytes); setErr != nil {
			p.API.LogWarn("Failed to set bot profile image", "error", setErr.Error())
		}
	}

	return createdBot.UserId, nil
}

func (p *Plugin) ExecuteCommand(c *plugin.Context, args *model.CommandArgs) (*model.CommandResponse, *model.AppError) {
	trigger := strings.TrimPrefix(strings.Fields(args.Command)[0], "/")

	switch trigger {
	case "tasks-message-on":
		return p.handleDailyTasksOn(args)
	case "tasks-message-off":
		return p.handleDailyTasksOff(args)
	case "tasks-message-reset":
		return p.handleDailyTasksReset(args)
	}
	return &model.CommandResponse{}, nil
}

func (p *Plugin) handleDailyTasksOn(args *model.CommandArgs) (*model.CommandResponse, *model.AppError) {
	prefs := p.getUserDailyPrefs(args.UserId)
	prefs.Enabled = true
	p.saveUserDailyPrefs(args.UserId, prefs)

	return &model.CommandResponse{
		ResponseType: model.CommandResponseTypeEphemeral,
		Text:         "✅ Daily task reminders are now **enabled**. You'll receive a summary of your assigned tasks when you first log in each day.",
	}, nil
}

func (p *Plugin) handleDailyTasksOff(args *model.CommandArgs) (*model.CommandResponse, *model.AppError) {
	prefs := p.getUserDailyPrefs(args.UserId)
	prefs.Enabled = false
	p.saveUserDailyPrefs(args.UserId, prefs)

	return &model.CommandResponse{
		ResponseType: model.CommandResponseTypeEphemeral,
		Text:         "🔕 Daily task reminders are now **disabled**.",
	}, nil
}

func (p *Plugin) handleDailyTasksReset(args *model.CommandArgs) (*model.CommandResponse, *model.AppError) {
	prefs := p.getUserDailyPrefs(args.UserId)
	prefs.LastMessageDate = ""
	prefs.Enabled = true
	p.saveUserDailyPrefs(args.UserId, prefs)

	return &model.CommandResponse{
		ResponseType: model.CommandResponseTypeEphemeral,
		Text:         "🔄 Daily task reminder has been **reset**. You will receive a new summary on your next action.",
	}, nil
}

func (p *Plugin) getUserDailyPrefs(userID string) *UserDailyPrefs {
	key := fmt.Sprintf("daily_prefs_%s", userID)
	data, err := p.API.KVGet(key)
	if err != nil || data == nil {
		return &UserDailyPrefs{Enabled: true}
	}

	var prefs UserDailyPrefs
	if err := json.Unmarshal(data, &prefs); err != nil {
		return &UserDailyPrefs{Enabled: true}
	}
	return &prefs
}

func (p *Plugin) saveUserDailyPrefs(userID string, prefs *UserDailyPrefs) error {
	key := fmt.Sprintf("daily_prefs_%s", userID)
	data, err := json.Marshal(prefs)
	if err != nil {
		return err
	}
	return p.API.KVSet(key, data)
}

func (p *Plugin) UserHasLoggedIn(c *plugin.Context, user *model.User) {
	p.checkAndSendDailyMessage(user.Id)
}

func (p *Plugin) MessageHasBeenPosted(c *plugin.Context, post *model.Post) {
	if post.UserId == p.botUserID {
		return
	}
	p.checkAndSendDailyMessage(post.UserId)
}

func (p *Plugin) checkAndSendDailyMessage(userID string) {
	prefs := p.getUserDailyPrefs(userID)
	if !prefs.Enabled {
		return
	}

	today := time.Now().Format("2006-01-02")
	if prefs.LastMessageDate == today {
		return
	}

	prefs.LastMessageDate = today
	p.saveUserDailyPrefs(userID, prefs)

	go p.sendDailyTaskSummary(userID)
}

func (p *Plugin) sendDailyTaskSummary(userID string) {
	// Get channel tasks assigned to user
	channelTasks := p.getTasksAssignedToUser(userID)

	// Get private tasks with deadlines
	privateTasks := p.getPrivateTasksWithDeadlines(userID)

	// Combine all tasks
	allTasks := append(channelTasks, privateTasks...)

	if len(allTasks) == 0 {
		return
	}

	todayTasks, weekTasks, otherTasks := p.categorizeTasks(allTasks)

	var sb strings.Builder
	sb.WriteString("### Your Daily Task Summary\n\n\n")

	if len(todayTasks) > 0 {
		sb.WriteString("🟥 **Due Today**\n")
		p.writeTaskList(&sb, todayTasks)
		sb.WriteString("\n")
	}

	if len(weekTasks) > 0 {
		sb.WriteString("🟧 **Due Within 1 Week**\n")
		p.writeTaskList(&sb, weekTasks)
		sb.WriteString("\n")
	}

	if len(otherTasks) > 0 {
		sb.WriteString("🟩 **Everything Else**\n")
		p.writeTaskList(&sb, otherTasks)
		sb.WriteString("\n")
	}

	sb.WriteString("---\n")
	sb.WriteString("_Use `/tasks-message-off` to disable these reminders._\n\n")
	sb.WriteString("---\n")

	channel, err := p.API.GetDirectChannel(userID, p.botUserID)
	if err != nil {
		p.API.LogError("Failed to get direct channel", "error", err.Error())
		return
	}

	post := &model.Post{
		UserId:    p.botUserID,
		ChannelId: channel.Id,
		Message:   sb.String(),
	}

	if _, err := p.API.CreatePost(post); err != nil {
		p.API.LogError("Failed to create daily summary post", "error", err.Error())
	}
}

func (p *Plugin) getTasksAssignedToUser(userID string) []TaskWithContext {
	var result []TaskWithContext

	channels, err := p.API.GetChannelsForTeamForUser("", userID, false)
	if err != nil {
		return result
	}

	for _, channel := range channels {
		list := p.getChannelTaskList(channel.Id)
		groupMap := make(map[string]string)
		for _, g := range list.Groups {
			groupMap[g.ID] = g.Name
		}

		for _, task := range list.Items {
			if task.Completed {
				continue
			}
			for _, assigneeID := range task.AssigneeIDs {
				if assigneeID == userID {
					groupName := "Ungrouped"
					if task.GroupID != "" {
						if name, ok := groupMap[task.GroupID]; ok {
							groupName = name
						}
					}
					result = append(result, TaskWithContext{
						Task:        task,
						GroupName:   groupName,
						ChannelID:   channel.Id,
						ChannelName: channel.DisplayName,
						IsPrivate:   false,
					})
					break
				}
			}
		}
	}

	return result
}

func (p *Plugin) getPrivateTasksWithDeadlines(userID string) []TaskWithContext {
	var result []TaskWithContext

	key := p.privateTasksKey(userID)
	data, appErr := p.API.KVGet(key)
	if appErr != nil || data == nil {
		return result
	}

	var taskList ChannelTaskList
	if err := json.Unmarshal(data, &taskList); err != nil {
		return result
	}

	groupMap := make(map[string]string)
	for _, g := range taskList.Groups {
		groupMap[g.ID] = g.Name
	}

	for _, task := range taskList.Items {
		// Only include incomplete private tasks that have a deadline
		if task.Completed || task.Deadline == nil {
			continue
		}

		groupName := "Ungrouped"
		if task.GroupID != "" {
			if name, ok := groupMap[task.GroupID]; ok {
				groupName = name
			}
		}

		result = append(result, TaskWithContext{
			Task:        task,
			GroupName:   groupName,
			ChannelID:   "",
			ChannelName: "Private Tasks",
			IsPrivate:   true,
		})
	}

	return result
}

func (p *Plugin) categorizeTasks(tasks []TaskWithContext) (today, week, other []TaskWithContext) {
	now := time.Now()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	todayEnd := todayStart.Add(24 * time.Hour)
	weekEnd := todayStart.Add(7 * 24 * time.Hour)

	for _, t := range tasks {
		if t.Task.Deadline == nil {
			other = append(other, t)
			continue
		}

		deadline := *t.Task.Deadline
		if deadline.Before(todayEnd) {
			today = append(today, t)
		} else if deadline.Before(weekEnd) {
			week = append(week, t)
		} else {
			other = append(other, t)
		}
	}

	sortTasks := func(tasks []TaskWithContext) {
		sort.Slice(tasks, func(i, j int) bool {
			// Sort private tasks after channel tasks within same deadline category
			if tasks[i].IsPrivate != tasks[j].IsPrivate {
				return !tasks[i].IsPrivate
			}
			if tasks[i].ChannelName != tasks[j].ChannelName {
				return tasks[i].ChannelName < tasks[j].ChannelName
			}
			di := tasks[i].Task.Deadline
			dj := tasks[j].Task.Deadline
			if di != nil && dj != nil {
				if !di.Equal(*dj) {
					return di.Before(*dj)
				}
			} else if di != nil {
				return true
			} else if dj != nil {
				return false
			}
			return tasks[i].Task.Text < tasks[j].Task.Text
		})
	}

	sortTasks(today)
	sortTasks(week)
	sortTasks(other)

	return today, week, other
}

func (p *Plugin) writeTaskList(sb *strings.Builder, tasks []TaskWithContext) {
	for _, t := range tasks {
		deadlineStr := ""
		if t.Task.Deadline != nil {
			deadlineStr = fmt.Sprintf(" _(due %s)_", t.Task.Deadline.Format("Jan 2"))
		}
		if t.IsPrivate {
			sb.WriteString(fmt.Sprintf("- **🔒 Private**: %s%s\n", t.Task.Text, deadlineStr))
		} else {
			sb.WriteString(fmt.Sprintf("- **%s**: %s%s\n", t.ChannelName, t.Task.Text, deadlineStr))
		}
	}
}

func (p *Plugin) ServeHTTP(c *plugin.Context, w http.ResponseWriter, r *http.Request) {
	switch r.URL.Path {
	case "/api/v1/tasks":
		p.handleTasks(w, r)
	case "/api/v1/groups":
		p.handleGroups(w, r)
	case "/api/v1/activity":
		p.handleActivity(w, r)
	case "/api/v1/private/tasks":
		p.handlePrivateTasks(w, r)
	case "/api/v1/private/groups":
		p.handlePrivateGroups(w, r)
	default:
		http.NotFound(w, r)
	}
}

func (p *Plugin) handleActivity(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := r.Header.Get("Mattermost-User-Id")
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	p.checkAndSendDailyMessage(userID)
	w.WriteHeader(http.StatusOK)
}

func (p *Plugin) handleTasks(w http.ResponseWriter, r *http.Request) {
	channelID := r.URL.Query().Get("channel_id")
	if channelID == "" {
		http.Error(w, "channel_id required", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case http.MethodGet:
		p.getTasks(w, r, channelID)
	case http.MethodPost:
		p.createTask(w, r, channelID)
	case http.MethodPut:
		p.updateTask(w, r, channelID)
	case http.MethodDelete:
		p.deleteTask(w, r, channelID)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (p *Plugin) handleGroups(w http.ResponseWriter, r *http.Request) {
	channelID := r.URL.Query().Get("channel_id")
	if channelID == "" {
		http.Error(w, "channel_id required", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case http.MethodPost:
		p.createGroup(w, r, channelID)
	case http.MethodPut:
		p.updateGroup(w, r, channelID)
	case http.MethodDelete:
		p.deleteGroup(w, r, channelID)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// Private Tasks Handlers
func (p *Plugin) handlePrivateTasks(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		userID = r.Header.Get("Mattermost-User-Id")
	}
	if userID == "" {
		http.Error(w, "user_id is required", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case http.MethodGet:
		p.getPrivateTasks(w, userID)
	case http.MethodPost:
		p.createPrivateTask(w, r, userID)
	case http.MethodPut:
		p.updatePrivateTask(w, r, userID)
	case http.MethodDelete:
		taskID := r.URL.Query().Get("id")
		p.deletePrivateTask(w, userID, taskID)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (p *Plugin) handlePrivateGroups(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		userID = r.Header.Get("Mattermost-User-Id")
	}
	if userID == "" {
		http.Error(w, "user_id is required", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case http.MethodPost:
		p.createPrivateGroup(w, r, userID)
	case http.MethodPut:
		p.updatePrivateGroup(w, r, userID)
	case http.MethodDelete:
		groupID := r.URL.Query().Get("id")
		p.deletePrivateGroup(w, userID, groupID)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// Private task storage key
func (p *Plugin) privateTasksKey(userID string) string {
	return fmt.Sprintf("private_tasks_%s", userID)
}

func (p *Plugin) getPrivateTasks(w http.ResponseWriter, userID string) {
	key := p.privateTasksKey(userID)
	data, appErr := p.API.KVGet(key)
	if appErr != nil {
		http.Error(w, appErr.Error(), http.StatusInternalServerError)
		return
	}

	taskList := ChannelTaskList{Items: []TaskItem{}, Groups: []TaskGroup{}}
	if data != nil {
		json.Unmarshal(data, &taskList)
	}
	if taskList.Items == nil {
		taskList.Items = []TaskItem{}
	}
	if taskList.Groups == nil {
		taskList.Groups = []TaskGroup{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(taskList)
}

func (p *Plugin) createPrivateTask(w http.ResponseWriter, r *http.Request, userID string) {
	var task TaskItem
	if err := json.NewDecoder(r.Body).Decode(&task); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	task.ID = model.NewId()
	task.CreatedAt = time.Now()

	key := p.privateTasksKey(userID)
	data, _ := p.API.KVGet(key)
	taskList := ChannelTaskList{Items: []TaskItem{}, Groups: []TaskGroup{}}
	if data != nil {
		json.Unmarshal(data, &taskList)
	}

	taskList.Items = append(taskList.Items, task)
	taskList.HasEverHadTasks = true

	newData, _ := json.Marshal(taskList)
	p.API.KVSet(key, newData)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(task)
}

func (p *Plugin) updatePrivateTask(w http.ResponseWriter, r *http.Request, userID string) {
	var updatedTask TaskItem
	if err := json.NewDecoder(r.Body).Decode(&updatedTask); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	key := p.privateTasksKey(userID)
	data, _ := p.API.KVGet(key)
	taskList := ChannelTaskList{Items: []TaskItem{}, Groups: []TaskGroup{}}
	if data != nil {
		json.Unmarshal(data, &taskList)
	}

	for i, task := range taskList.Items {
		if task.ID == updatedTask.ID {
			if updatedTask.Completed && !task.Completed {
				updatedTask.CompletedAt = time.Now()
			}
			taskList.Items[i] = updatedTask
			break
		}
	}

	newData, _ := json.Marshal(taskList)
	p.API.KVSet(key, newData)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(updatedTask)
}

func (p *Plugin) deletePrivateTask(w http.ResponseWriter, userID, taskID string) {
	if taskID == "" {
		http.Error(w, "id required", http.StatusBadRequest)
		return
	}

	key := p.privateTasksKey(userID)
	data, _ := p.API.KVGet(key)
	taskList := ChannelTaskList{Items: []TaskItem{}, Groups: []TaskGroup{}}
	if data != nil {
		json.Unmarshal(data, &taskList)
	}

	for i, task := range taskList.Items {
		if task.ID == taskID {
			taskList.Items = append(taskList.Items[:i], taskList.Items[i+1:]...)
			break
		}
	}

	newData, _ := json.Marshal(taskList)
	p.API.KVSet(key, newData)

	w.WriteHeader(http.StatusNoContent)
}

func (p *Plugin) createPrivateGroup(w http.ResponseWriter, r *http.Request, userID string) {
	var group TaskGroup
	if err := json.NewDecoder(r.Body).Decode(&group); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	group.ID = model.NewId()

	key := p.privateTasksKey(userID)
	data, _ := p.API.KVGet(key)
	taskList := ChannelTaskList{Items: []TaskItem{}, Groups: []TaskGroup{}}
	if data != nil {
		json.Unmarshal(data, &taskList)
	}

	taskList.Groups = append(taskList.Groups, group)

	newData, _ := json.Marshal(taskList)
	p.API.KVSet(key, newData)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(group)
}

func (p *Plugin) updatePrivateGroup(w http.ResponseWriter, r *http.Request, userID string) {
	var updatedGroup TaskGroup
	if err := json.NewDecoder(r.Body).Decode(&updatedGroup); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	key := p.privateTasksKey(userID)
	data, _ := p.API.KVGet(key)
	taskList := ChannelTaskList{Items: []TaskItem{}, Groups: []TaskGroup{}}
	if data != nil {
		json.Unmarshal(data, &taskList)
	}

	for i, group := range taskList.Groups {
		if group.ID == updatedGroup.ID {
			taskList.Groups[i] = updatedGroup
			break
		}
	}

	newData, _ := json.Marshal(taskList)
	p.API.KVSet(key, newData)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(updatedGroup)
}

func (p *Plugin) deletePrivateGroup(w http.ResponseWriter, userID, groupID string) {
	if groupID == "" {
		http.Error(w, "id required", http.StatusBadRequest)
		return
	}

	key := p.privateTasksKey(userID)
	data, _ := p.API.KVGet(key)
	taskList := ChannelTaskList{Items: []TaskItem{}, Groups: []TaskGroup{}}
	if data != nil {
		json.Unmarshal(data, &taskList)
	}

	for i, group := range taskList.Groups {
		if group.ID == groupID {
			taskList.Groups = append(taskList.Groups[:i], taskList.Groups[i+1:]...)
			// Also ungroup any tasks in this group
			for j := range taskList.Items {
				if taskList.Items[j].GroupID == groupID {
					taskList.Items[j].GroupID = ""
				}
			}
			break
		}
	}

	newData, _ := json.Marshal(taskList)
	p.API.KVSet(key, newData)

	w.WriteHeader(http.StatusNoContent)
}

// Channel task methods
func (p *Plugin) getTasks(w http.ResponseWriter, r *http.Request, channelID string) {
	userID := r.Header.Get("Mattermost-User-Id")
	if userID != "" {
		p.checkAndSendDailyMessage(userID)
	}

	list := p.getChannelTaskList(channelID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(list)
}

func (p *Plugin) createTask(w http.ResponseWriter, r *http.Request, channelID string) {
	var item TaskItem
	if err := json.NewDecoder(r.Body).Decode(&item); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	item.ID = model.NewId()
	item.CreatedAt = time.Now()

	list := p.getChannelTaskList(channelID)
	list.Items = append(list.Items, item)
	list.HasEverHadTasks = true
	p.saveChannelTaskList(channelID, list)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(item)
}

func (p *Plugin) updateTask(w http.ResponseWriter, r *http.Request, channelID string) {
	var updated TaskItem
	if err := json.NewDecoder(r.Body).Decode(&updated); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	list := p.getChannelTaskList(channelID)
	for i, item := range list.Items {
		if item.ID == updated.ID {
			if updated.Completed && !item.Completed {
				updated.CompletedAt = time.Now()
			}
			list.Items[i] = updated
			p.saveChannelTaskList(channelID, list)
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(updated)
			return
		}
	}

	http.Error(w, "Task not found", http.StatusNotFound)
}

func (p *Plugin) deleteTask(w http.ResponseWriter, r *http.Request, channelID string) {
	taskID := r.URL.Query().Get("id")
	if taskID == "" {
		http.Error(w, "id required", http.StatusBadRequest)
		return
	}

	list := p.getChannelTaskList(channelID)
	for i, item := range list.Items {
		if item.ID == taskID {
			list.Items = append(list.Items[:i], list.Items[i+1:]...)
			p.saveChannelTaskList(channelID, list)
			w.WriteHeader(http.StatusNoContent)
			return
		}
	}

	http.Error(w, "Task not found", http.StatusNotFound)
}

func (p *Plugin) createGroup(w http.ResponseWriter, r *http.Request, channelID string) {
	var group TaskGroup
	if err := json.NewDecoder(r.Body).Decode(&group); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	group.ID = model.NewId()

	list := p.getChannelTaskList(channelID)
	list.Groups = append(list.Groups, group)
	p.saveChannelTaskList(channelID, list)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(group)
}

func (p *Plugin) updateGroup(w http.ResponseWriter, r *http.Request, channelID string) {
	var updated TaskGroup
	if err := json.NewDecoder(r.Body).Decode(&updated); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	list := p.getChannelTaskList(channelID)
	for i, group := range list.Groups {
		if group.ID == updated.ID {
			list.Groups[i] = updated
			p.saveChannelTaskList(channelID, list)
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(updated)
			return
		}
	}

	http.Error(w, "Group not found", http.StatusNotFound)
}

func (p *Plugin) deleteGroup(w http.ResponseWriter, r *http.Request, channelID string) {
	groupID := r.URL.Query().Get("id")
	if groupID == "" {
		http.Error(w, "id required", http.StatusBadRequest)
		return
	}

	list := p.getChannelTaskList(channelID)
	for i, group := range list.Groups {
		if group.ID == groupID {
			list.Groups = append(list.Groups[:i], list.Groups[i+1:]...)
			for j := range list.Items {
				if list.Items[j].GroupID == groupID {
					list.Items[j].GroupID = ""
				}
			}
			p.saveChannelTaskList(channelID, list)
			w.WriteHeader(http.StatusNoContent)
			return
		}
	}

	http.Error(w, "Group not found", http.StatusNotFound)
}

func (p *Plugin) getChannelTaskList(channelID string) *ChannelTaskList {
	key := fmt.Sprintf("tasks_%s", channelID)
	data, err := p.API.KVGet(key)
	if err != nil || data == nil {
		return &ChannelTaskList{
			Items:           []TaskItem{},
			Groups:          []TaskGroup{},
			HasEverHadTasks: false,
		}
	}

	var list ChannelTaskList
	if err := json.Unmarshal(data, &list); err != nil {
		return &ChannelTaskList{
			Items:           []TaskItem{},
			Groups:          []TaskGroup{},
			HasEverHadTasks: false,
		}
	}

	return &list
}

func (p *Plugin) saveChannelTaskList(channelID string, list *ChannelTaskList) error {
	key := fmt.Sprintf("tasks_%s", channelID)
	data, err := json.Marshal(list)
	if err != nil {
		return err
	}

	return p.API.KVSet(key, data)
}

func main() {
	plugin.ClientMain(&Plugin{})
}
