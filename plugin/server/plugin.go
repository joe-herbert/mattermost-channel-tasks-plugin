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

	// Daily message commands
	commands := []struct {
		Trigger string
		Desc    string
	}{
		{"tasks-message-on", "Enable daily task reminders"},
		{"tasks-message-off", "Disable daily task reminders"},
		{"tasks-message-reset", "Reset daily task reminder"},
		// Channel task commands
		{"tasks", "Show all tasks in this channel"},
		{"tasks-mine", "Show tasks assigned to me in this channel"},
		{"tasks-overdue", "Show tasks due in the past in this channel"},
		{"tasks-today", "Show tasks due today in this channel"},
		{"tasks-incomplete", "Show incomplete tasks in this channel"},
		{"tasks-complete", "Show completed tasks in this channel"},
		{"tasks-todo", "Show which tasks to focus on next in this channel (incomplete, assigned to me, prioritized by deadline)"},
		// Private task commands
		{"tasks-private", "Show all private tasks"},
		{"tasks-private-overdue", "Show private tasks due in the past"},
		{"tasks-private-today", "Show private tasks due today"},
		{"tasks-private-incomplete", "Show incomplete private tasks"},
		{"tasks-private-complete", "Show completed private tasks"},
		{"tasks-private-todo", "Show which private tasks to focus on next (incomplete, prioritized by deadline)"},
		// Aliases - Channel task commands
		{"t", "Show all tasks in this channel (alias for /tasks)"},
		{"tmine", "Show tasks assigned to me in this channel (alias for /tasks-mine)"},
		{"ttodo", "Show which tasks to focus on next in this channel (alias for /tasks-todo)"},
		// Aliases - Private task commands
		{"tp", "Show all private tasks (alias for /tasks-private)"},
		{"tptodo", "Show which private tasks to focus on next (alias for /tasks-private-todo)"},
	}

	for _, cmd := range commands {
		if err := p.API.RegisterCommand(&model.Command{
			Trigger:          cmd.Trigger,
			AutoComplete:     true,
			AutoCompleteDesc: cmd.Desc,
		}); err != nil {
			return fmt.Errorf("failed to register %s command: %w", cmd.Trigger, err)
		}
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
		// Channel task commands
	case "tasks", "t":
		return p.handleTasksCommand(args, "all")
	case "tasks-mine", "tmine":
		return p.handleTasksCommand(args, "mine")
	case "tasks-overdue":
		return p.handleTasksCommand(args, "overdue")
	case "tasks-today":
		return p.handleTasksCommand(args, "today")
	case "tasks-incomplete":
		return p.handleTasksCommand(args, "incomplete")
	case "tasks-complete":
		return p.handleTasksCommand(args, "complete")
	case "tasks-todo", "ttodo":
		return p.handleTasksCommand(args, "todo")
		// Private task commands
	case "tasks-private", "tp":
		return p.handlePrivateTasksCommand(args, "all")
	case "tasks-private-today":
		return p.handlePrivateTasksCommand(args, "today")
	case "tasks-private-overdue":
		return p.handlePrivateTasksCommand(args, "overdue")
	case "tasks-private-incomplete":
		return p.handlePrivateTasksCommand(args, "incomplete")
	case "tasks-private-complete":
		return p.handlePrivateTasksCommand(args, "complete")
	case "tasks-private-todo", "tptodo":
		return p.handlePrivateTasksCommand(args, "todo")
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

func (p *Plugin) handleTasksCommand(args *model.CommandArgs, filter string) (*model.CommandResponse, *model.AppError) {
	list := p.getChannelTaskList(args.ChannelId)

	// Get channel name for display
	channel, chErr := p.API.GetChannel(args.ChannelId)
	channelName := "This Channel"
	if chErr == nil && channel != nil {
		channelName = channel.DisplayName
	}

	if len(list.Items) == 0 {
		return &model.CommandResponse{
			ResponseType: model.CommandResponseTypeEphemeral,
			Text:         fmt.Sprintf("📋 No tasks in **%s**.", channelName),
		}, nil
	}

	groupMap := make(map[string]string)
	for _, g := range list.Groups {
		groupMap[g.ID] = g.Name
	}

	var filtered []TaskItem
	now := time.Now()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	todayEnd := todayStart.Add(24 * time.Hour)
	weekEnd := todayStart.Add(7 * 24 * time.Hour)

	switch filter {
	case "all":
		filtered = list.Items
	case "mine":
		for _, t := range list.Items {
			for _, aid := range t.AssigneeIDs {
				if aid == args.UserId {
					filtered = append(filtered, t)
					break
				}
			}
		}
	case "today":
		for _, t := range list.Items {
			if t.Deadline != nil && t.Deadline.Before(todayEnd) && !t.Deadline.Before(todayStart) {
				filtered = append(filtered, t)
			}
		}
	case "overdue":
		for _, t := range list.Items {
			if t.Deadline != nil && t.Deadline.Before(todayStart) {
				filtered = append(filtered, t)
			}
		}
	case "incomplete":
		for _, t := range list.Items {
			if !t.Completed {
				filtered = append(filtered, t)
			}
		}
	case "complete":
		for _, t := range list.Items {
			if t.Completed {
				filtered = append(filtered, t)
			}
		}
	case "todo":
		// Get tasks assigned to me that are incomplete
		var myIncomplete []TaskItem
		for _, t := range list.Items {
			if t.Completed {
				continue
			}
			for _, aid := range t.AssigneeIDs {
				if aid == args.UserId {
					myIncomplete = append(myIncomplete, t)
					break
				}
			}
		}
		// Prioritize: today first, then within week, then others
		var overdueTasks, todayTasks, weekTasks, otherTasks []TaskItem
		for _, t := range myIncomplete {
			if t.Deadline == nil {
				otherTasks = append(otherTasks, t)
			} else if t.Deadline.Before(todayStart) {
				overdueTasks = append(overdueTasks, t)
			} else if t.Deadline.Before(todayEnd) {
				todayTasks = append(todayTasks, t)
			} else if t.Deadline.Before(weekEnd) {
				weekTasks = append(weekTasks, t)
			} else {
				otherTasks = append(otherTasks, t)
			}
		}
		// Show today if any, else week if any, else all
		if len(overdueTasks) > 0 {
			filtered = overdueTasks
		} else if len(todayTasks) > 0 {
			filtered = todayTasks
		} else if len(weekTasks) > 0 {
			filtered = weekTasks
		} else {
			filtered = myIncomplete
		}
	}

	if len(filtered) == 0 {
		emptyMsg := p.getEmptyFilterMessage(filter, channelName, false)
		return &model.CommandResponse{
			ResponseType: model.CommandResponseTypeEphemeral,
			Text:         emptyMsg,
		}, nil
	}

	// Sort by deadline then by text
	sort.Slice(filtered, func(i, j int) bool {
		di, dj := filtered[i].Deadline, filtered[j].Deadline
		if di != nil && dj != nil {
			if !di.Equal(*dj) {
				return di.Before(*dj)
			}
		} else if di != nil {
			return true
		} else if dj != nil {
			return false
		}
		return filtered[i].Text < filtered[j].Text
	})

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("### %s Tasks (%s)\n\n", channelName, p.filterLabel(filter)))

	for _, t := range filtered {
		statusIcon := p.getTaskStatusIcon(t, todayEnd, weekEnd)
		deadlineStr := p.formatDeadline(t.Deadline)
		groupStr := ""
		if t.GroupID != "" {
			if name, ok := groupMap[t.GroupID]; ok {
				groupStr = fmt.Sprintf(" | **%s**", name)
			}
		}
		if deadlineStr != "" {
			deadlineStr = " |" + deadlineStr
		}
		sb.WriteString(fmt.Sprintf("- %s %s%s%s\n", statusIcon, t.Text, groupStr, deadlineStr))
	}

	return &model.CommandResponse{
		ResponseType: model.CommandResponseTypeEphemeral,
		Text:         sb.String(),
	}, nil
}

func (p *Plugin) handlePrivateTasksCommand(args *model.CommandArgs, filter string) (*model.CommandResponse, *model.AppError) {
	key := p.privateTasksKey(args.UserId)
	data, appErr := p.API.KVGet(key)
	if appErr != nil {
		return &model.CommandResponse{
			ResponseType: model.CommandResponseTypeEphemeral,
			Text:         "❌ Error loading private tasks.",
		}, nil
	}

	taskList := ChannelTaskList{Items: []TaskItem{}, Groups: []TaskGroup{}}
	if data != nil {
		json.Unmarshal(data, &taskList)
	}

	if len(taskList.Items) == 0 {
		return &model.CommandResponse{
			ResponseType: model.CommandResponseTypeEphemeral,
			Text:         "🔒 No private tasks yet. Use the task sidebar to add some!",
		}, nil
	}

	groupMap := make(map[string]string)
	for _, g := range taskList.Groups {
		groupMap[g.ID] = g.Name
	}

	var filtered []TaskItem
	now := time.Now()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	todayEnd := todayStart.Add(24 * time.Hour)
	weekEnd := todayStart.Add(7 * 24 * time.Hour)

	switch filter {
	case "all":
		filtered = taskList.Items
	case "today":
		for _, t := range taskList.Items {
			if t.Deadline != nil && t.Deadline.Before(todayEnd) && !t.Deadline.Before(todayStart) {
				filtered = append(filtered, t)
			}
		}
	case "overdue":
		for _, t := range taskList.Items {
			if t.Deadline != nil && t.Deadline.Before(todayStart) {
				filtered = append(filtered, t)
			}
		}
	case "incomplete":
		for _, t := range taskList.Items {
			if !t.Completed {
				filtered = append(filtered, t)
			}
		}
	case "complete":
		for _, t := range taskList.Items {
			if t.Completed {
				filtered = append(filtered, t)
			}
		}
	case "todo":
		// Get incomplete tasks, prioritize by deadline
		var incomplete []TaskItem
		for _, t := range taskList.Items {
			if !t.Completed {
				incomplete = append(incomplete, t)
			}
		}
		var overdueTasks, todayTasks, weekTasks, otherTasks []TaskItem
		for _, t := range incomplete {
			if t.Deadline == nil {
				otherTasks = append(otherTasks, t)
			} else if t.Deadline.Before(todayStart) {
				overdueTasks = append(overdueTasks, t)
			} else if t.Deadline.Before(todayEnd) {
				todayTasks = append(todayTasks, t)
			} else if t.Deadline.Before(weekEnd) {
				weekTasks = append(weekTasks, t)
			} else {
				otherTasks = append(otherTasks, t)
			}
		}
		if len(overdueTasks) > 0 {
			filtered = overdueTasks
		} else if len(todayTasks) > 0 {
			filtered = todayTasks
		} else if len(weekTasks) > 0 {
			filtered = weekTasks
		} else {
			filtered = incomplete
		}
	}

	if len(filtered) == 0 {
		emptyMsg := p.getEmptyFilterMessage(filter, "", true)
		return &model.CommandResponse{
			ResponseType: model.CommandResponseTypeEphemeral,
			Text:         emptyMsg,
		}, nil
	}

	// Sort by deadline then by text
	sort.Slice(filtered, func(i, j int) bool {
		di, dj := filtered[i].Deadline, filtered[j].Deadline
		if di != nil && dj != nil {
			if !di.Equal(*dj) {
				return di.Before(*dj)
			}
		} else if di != nil {
			return true
		} else if dj != nil {
			return false
		}
		return filtered[i].Text < filtered[j].Text
	})

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("### 🔒 Private Tasks (%s)\n\n", p.filterLabel(filter)))

	for _, t := range filtered {
		statusIcon := p.getTaskStatusIcon(t, todayEnd, weekEnd)
		deadlineStr := p.formatDeadline(t.Deadline)
		groupStr := ""
		if t.GroupID != "" {
			if name, ok := groupMap[t.GroupID]; ok {
				groupStr = fmt.Sprintf(" | **%s**", name)
			}
		}
		if deadlineStr != "" {
			deadlineStr = " |" + deadlineStr
		}
		sb.WriteString(fmt.Sprintf("- %s %s%s%s\n", statusIcon, t.Text, groupStr, deadlineStr))
	}

	return &model.CommandResponse{
		ResponseType: model.CommandResponseTypeEphemeral,
		Text:         sb.String(),
	}, nil
}

func (p *Plugin) filterLabel(filter string) string {
	switch filter {
	case "all":
		return "All"
	case "mine":
		return "Assigned to Me"
	case "today":
		return "Due Today"
	case "overdue":
		return "Overdue"
	case "incomplete":
		return "Incomplete"
	case "complete":
		return "Complete"
	case "todo":
		return "To Do"
	default:
		return filter
	}
}

func (p *Plugin) getTaskStatusIcon(task TaskItem, todayEnd, weekEnd time.Time) string {
	if task.Completed {
		return "🟩"
	}
	if task.Deadline == nil {
		return "⬜"
	}
	now := time.Now()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	if task.Deadline.Before(todayStart) {
		return "🟥" // Overdue
	}
	if task.Deadline.Before(todayEnd) {
		return "🟧" // Due today
	}
	if task.Deadline.Before(weekEnd) {
		return "🟨" // Due within a week
	}
	return "⬜" // No urgent deadline
}

func (p *Plugin) formatDeadline(deadline *time.Time) string {
	if deadline == nil {
		return ""
	}

	now := time.Now()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	tomorrowStart := todayStart.Add(24 * time.Hour)
	dayAfterTomorrow := todayStart.Add(48 * time.Hour)

	if deadline.Before(todayStart) {
		// Overdue - show the date
		return fmt.Sprintf(" _due %s_", deadline.Format("Mon Jan 2"))
	} else if deadline.Before(tomorrowStart) {
		return " _due Today_"
	} else if deadline.Before(dayAfterTomorrow) {
		return " _due Tomorrow_"
	}
	return fmt.Sprintf(" _due %s_", deadline.Format("Mon Jan 2"))
}

func (p *Plugin) getEmptyFilterMessage(filter, channelName string, isPrivate bool) string {
	prefix := "📋"
	location := fmt.Sprintf("in **%s**", channelName)
	if isPrivate {
		prefix = "🔒"
		location = "in your private tasks"
	}

	switch filter {
	case "mine":
		return fmt.Sprintf("%s No tasks assigned to you %s.", prefix, location)
	case "today":
		return fmt.Sprintf("%s No tasks due today %s. 🎉", prefix, location)
	case "incomplete":
		return fmt.Sprintf("%s All tasks are complete %s! 🎉", prefix, location)
	case "complete":
		return fmt.Sprintf("%s No completed tasks %s yet.", prefix, location)
	case "todo":
		if isPrivate {
			return fmt.Sprintf("%s Nothing on your private to-do list! 🎉", prefix)
		}
		return fmt.Sprintf("%s Nothing on your to-do list %s! 🎉", prefix, location)
	default:
		return fmt.Sprintf("%s No tasks match this filter %s.", prefix, location)
	}
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
	privateTasks := p.getPrivateTasksForMessage(userID)

	// Combine all tasks
	allTasks := append(channelTasks, privateTasks...)

	if len(allTasks) == 0 {
		return
	}

	completedYesterdayTasks, overdueTasks, todayTasks, weekTasks, otherTasks := p.categorizeTasks(allTasks)

	var sb strings.Builder
	sb.WriteString("### Your Daily Task Summary\n\n\n---\n")

	if len(completedYesterdayTasks) > 0 {
		sb.WriteString("🟩 **Completed Yesterday**\n\n")
		p.writeTaskList(&sb, completedYesterdayTasks)
		sb.WriteString("\n---\n")
	}

	if len(overdueTasks) > 0 {
		sb.WriteString("🟥 **Past Due**\n\n")
		p.writeTaskList(&sb, overdueTasks)
		sb.WriteString("\n---\n")
	}

	if len(todayTasks) > 0 {
		sb.WriteString("🟧 **Due Today**\n\n")
		p.writeTaskList(&sb, todayTasks)
		sb.WriteString("\n---\n")
	}

	if len(weekTasks) > 0 {
		sb.WriteString("🟨 **Due Within 1 Week**\n\n")
		p.writeTaskList(&sb, weekTasks)
		sb.WriteString("\n---\n")
	}

	if len(otherTasks) > 0 {
		sb.WriteString("⬜ **Everything Else**\n\n")
		p.writeTaskList(&sb, otherTasks)
		sb.WriteString("\n---\n")
	}

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

func (p *Plugin) getPrivateTasksForMessage(userID string) []TaskWithContext {
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

func (p *Plugin) categorizeTasks(tasks []TaskWithContext) (completedYesterdayTasks, overdue, today, week, other []TaskWithContext) {
	now := time.Now()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	todayEnd := todayStart.Add(24 * time.Hour)
	weekEnd := todayStart.Add(7 * 24 * time.Hour)

	for _, t := range tasks {
		if t.Task.Completed {
			completedAt := time.Date(t.Task.CompletedAt.Year(), t.Task.CompletedAt.Month(), t.Task.CompletedAt.Day(), 0, 0, 0, 0, t.Task.CompletedAt.Location())
			yesterdayStart := todayStart.Add(-24 * time.Hour)
			if completedAt.Equal(yesterdayStart) {
				completedYesterdayTasks = append(completedYesterdayTasks, t)
				continue
			}
			continue
		}

		if t.IsPrivate && t.Task.Deadline == nil {
			continue
		}

		if t.Task.Deadline == nil {
			other = append(other, t)
			continue
		}

		deadline := *t.Task.Deadline
		if deadline.Before(todayStart) {
			overdue = append(overdue, t)
		} else if deadline.Before(todayEnd) {
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

	sortTasks(completedYesterdayTasks)
	sortTasks(overdue)
	sortTasks(today)
	sortTasks(week)
	sortTasks(other)

	return completedYesterdayTasks, overdue, today, week, other
}

func (p *Plugin) writeTaskList(sb *strings.Builder, tasks []TaskWithContext) {
	lastChannelName := ""
	for _, t := range tasks {
		deadlineStr := ""
		if t.Task.Deadline != nil {
			deadlineStr = fmt.Sprintf(" | _due %s_", t.Task.Deadline.Format("Mon Jan 2"))
		}
		if lastChannelName != t.ChannelName {
			sb.WriteString(fmt.Sprintf("**%s**\n", t.ChannelName))
			lastChannelName = t.ChannelName
		}
		if t.IsPrivate {
			sb.WriteString(fmt.Sprintf("- %s%s\n", t.Task.Text, deadlineStr))
		} else {
			sb.WriteString(fmt.Sprintf("- %s%s\n", t.Task.Text, deadlineStr))
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
