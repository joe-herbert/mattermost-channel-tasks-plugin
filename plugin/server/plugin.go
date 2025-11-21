package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/mattermost/mattermost-server/v6/model"
	"github.com/mattermost/mattermost-server/v6/plugin"
)

type Plugin struct {
	plugin.MattermostPlugin
	configurationLock sync.RWMutex
}

type TaskItem struct {
	ID          string     `json:"id"`
	Text        string     `json:"text"`
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
	Items  []TaskItem  `json:"items"`
	Groups []TaskGroup `json:"groups"`
}

func (p *Plugin) OnActivate() error {
	return nil
}

func (p *Plugin) ServeHTTP(c *plugin.Context, w http.ResponseWriter, r *http.Request) {
	switch r.URL.Path {
	case "/api/v1/tasks":
		p.handleTasks(w, r)
	case "/api/v1/groups":
		p.handleGroups(w, r)
	default:
		http.NotFound(w, r)
	}
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

func (p *Plugin) getTasks(w http.ResponseWriter, r *http.Request, channelID string) {
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
			// Remove group association from items
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
			Items:  []TaskItem{},
			Groups: []TaskGroup{},
		}
	}

	var list ChannelTaskList
	if err := json.Unmarshal(data, &list); err != nil {
		return &ChannelTaskList{
			Items:  []TaskItem{},
			Groups: []TaskGroup{},
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
