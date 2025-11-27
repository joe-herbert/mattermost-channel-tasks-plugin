import React from 'react';
import {ChannelTaskList, TaskGroup, TaskItem} from '../types';
import {adjustOpacity, isHexLight} from '../utils';
import {TaskGroupSection} from './TaskGroupSection';
import {DeleteGroupWarning} from './DeleteGroupWarning';
import {DeleteCompletedWarning} from './DeleteCompletedWarning';
import {TaskItemNotes} from "./TaskItemNotes";

interface TaskSidebarProps {
    channelId?: string;
    channel?: any;
    theme?: any;
    onChannelChange?: (callback: () => void) => void;
    privateTasks?: boolean;
    onTogglePrivate?: () => void;  // Add this line
}

const ConfettiAnimation: React.FC<{ theme: any }> = ({theme}) => {
    const colors = [
        theme?.buttonBg || '#1c58d9',
        theme?.onlineIndicator || '#28a745',
        '#ff6b6b',
        '#ffd93d',
        '#6bcb77',
        '#4d96ff'
    ];

    const confettiPieces = Array.from({length: 50}, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 2,
        duration: 2 + Math.random() * 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        size: 6 + Math.random() * 8
    }));

    return (
        <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            overflow: 'hidden',
            pointerEvents: 'none',
            zIndex: 10
        }}>
            <style>{`
                @keyframes confetti-fall {
                    0% { transform: translateY(-100%) rotate(0deg); opacity: 1; }
                    100% { transform: translateY(400px) rotate(720deg); opacity: 0; }
                }
            `}</style>
            {confettiPieces.map(piece => (
                <div
                    key={piece.id}
                    style={{
                        position: 'absolute',
                        left: `${piece.left}%`,
                        top: 0,
                        width: `${piece.size}px`,
                        height: `${piece.size}px`,
                        backgroundColor: piece.color,
                        borderRadius: piece.id % 2 === 0 ? '50%' : '2px',
                        animation: `confetti-fall ${piece.duration}s ease-out ${piece.delay}s forwards`
                    }}
                />
            ))}
        </div>
    );
};

export class TaskSidebar extends React.Component<TaskSidebarProps> {
    state = {
        tasks: [] as TaskItem[],
        groups: [] as TaskGroup[],
        newTaskText: '',
        newGroupName: '',
        selectedGroup: '',
        newTaskDeadline: '',
        channelMembers: [] as any[],
        showGroupForm: false,
        showTaskForm: false,
        showFilters: false,
        draggedTask: null as TaskItem | null,
        dragOverTaskId: null as string | null,
        dragOverPosition: null as 'before' | 'after' | null,
        draggedGroup: null as TaskGroup | null,
        dragOverGroupId: null as string | null,
        dragOverGroupPosition: null as 'before' | 'after' | null,
        filterMyTasks: false,
        filterCompletion: 'all' as 'all' | 'complete' | 'incomplete',
        filterDeadline: 'all' as 'all' | 'today' | 'one-week' | 'overdue' | 'custom',
        filterDeadlineCustomFrom: '',
        filterDeadlineCustomTo: '',
        currentUserId: '',
        deleteGroupWarningShown: false,
        groupToDelete: null as { id: string, name: string, taskCount: number } | null,
        hasEverHadTasks: false,
        showConfetti: false,
        deleteCompletedWarningShown: false,
        taskToShowNotes: null as TaskItem | null,
        privateTasks: this.props.privateTasks || false,
    };

    componentDidMount() {
        this.loadFilterSettings();
        this.loadCurrentUser();
        this.loadTasks();
        this.loadChannelMembers();
        if (this.props.onChannelChange) {
            this.props.onChannelChange(() => {
                if (!this.state.privateTasks) {
                    this.loadTasks();
                    this.loadChannelMembers();
                }
            });
        }
        this.setState({privateTasks: this.props.privateTasks});
    }

    componentDidUpdate(prevProps: any, prevState: any) {
        if (prevProps.privateTasks !== this.props.privateTasks) {
            this.setState({privateTasks: this.props.privateTasks}, () => {
                this.loadTasks();
                if (!this.props.privateTasks) {
                    this.loadChannelMembers();
                }
            });
        }
        const prevChannelId = this.getChannelId(prevProps);
        const currentChannelId = this.getChannelId(this.props);
        if (!this.state.privateTasks && prevChannelId && currentChannelId && prevChannelId !== currentChannelId) {
            this.setState({_lastChannelId: currentChannelId, showConfetti: false});
            this.loadTasks();
            this.loadChannelMembers();
        }
        const prevHadIncompleteTasks = prevState.tasks.some((t: TaskItem) => !t.completed);
        const currentHasIncompleteTasks = this.state.tasks.some(t => !t.completed);
        const hadTasks = prevState.tasks.length > 0;
        const hasTasks = this.state.tasks.length > 0;
        if (hadTasks && hasTasks && prevHadIncompleteTasks && !currentHasIncompleteTasks && this.state.hasEverHadTasks) {
            this.triggerConfetti();
        }
    }

    triggerConfetti = () => {
        this.setState({showConfetti: true});
        setTimeout(() => this.setState({showConfetti: false}), 4000);
    };

    getChannelId(props = this.props) {
        return props.channelId || props.channel?.id || (window as any).store?.getState()?.entities?.channels?.currentChannelId;
    }

    getApiBaseUrl = () => {
        if (this.state.privateTasks) {
            return '/plugins/com.mattermost.channel-task/api/v1/private';
        }
        return '/plugins/com.mattermost.channel-task/api/v1';
    };

    getUserId = () => {
        return this.state.currentUserId || (window as any).store?.getState()?.entities?.users?.currentUserId || '';
    };

    loadFilterSettings = () => {
        try {
            const saved = localStorage.getItem('mattermost-task-filters');
            if (saved) {
                const f = JSON.parse(saved);
                this.setState({
                    filterMyTasks: f.filterMyTasks ?? false,
                    filterCompletion: f.filterCompletion ?? 'all',
                    filterDeadline: f.filterDeadline ?? 'all',
                    showFilters: f.showFilters ?? false
                });
            }
        } catch (e) {
            console.error('Error loading filter settings:', e);
        }
    };

    saveFilterSettings = () => {
        try {
            const f = {filterMyTasks: this.state.filterMyTasks, filterCompletion: this.state.filterCompletion, filterDeadline: this.state.filterDeadline, showFilters: this.state.showFilters};
            localStorage.setItem('mattermost-task-filters', JSON.stringify(f));
        } catch (e) {
            console.error('Error saving filter settings:', e);
        }
    };

    loadCurrentUser = async () => {
        try {
            const r = await fetch('/api/v4/users/me');
            const u = await r.json();
            this.setState({currentUserId: u.id});
        } catch (e) {
            console.error('Error loading current user:', e);
        }
    };

    loadTasks = async () => {
        const baseUrl = this.getApiBaseUrl();

        if (this.state.privateTasks) {
            const userId = this.getUserId();
            if (!userId) return;
            try {
                const r = await fetch(`${baseUrl}/tasks?user_id=${userId}`, {credentials: 'same-origin'});
                const data: ChannelTaskList = await r.json();
                const hasEverHadTasks = data.has_ever_had_tasks || false;
                this.setState({tasks: data.items || [], groups: data.groups || [], hasEverHadTasks});
            } catch (e) {
                console.error('Error loading private tasks:', e);
                this.setState({tasks: [], groups: [], hasEverHadTasks: false});
            }
        } else {
            const channelId = this.getChannelId();
            if (!channelId) return;
            try {
                const r = await fetch(`${baseUrl}/tasks?channel_id=${channelId}`, {credentials: 'same-origin'});
                const data: ChannelTaskList = await r.json();
                const hasEverHadTasks = data.has_ever_had_tasks || false;
                this.setState({tasks: data.items || [], groups: data.groups || [], hasEverHadTasks});
            } catch (e) {
                console.error('Error loading tasks:', e);
            }
        }
    };

    loadChannelMembers = async () => {
        if (this.state.privateTasks) {
            this.setState({channelMembers: []});
            return;
        }
        const channelId = this.getChannelId();
        if (!channelId) return;
        try {
            const r = await fetch(`/api/v4/channels/${channelId}/members`);
            const members = await r.json();
            const usersPromises = members.map((m: any) => fetch(`/api/v4/users/${m.user_id}`).then(r => r.json()));
            const users = await Promise.all(usersPromises);
            this.setState({channelMembers: users});
        } catch (e) {
            console.error('Error loading channel members:', e);
        }
    };

    addTask = async () => {
        const {newTaskText, selectedGroup, newTaskDeadline, privateTasks} = this.state;
        const baseUrl = this.getApiBaseUrl();

        if (!newTaskText.trim()) return;

        if (privateTasks) {
            const userId = this.getUserId();
            if (!userId) return;
            try {
                const taskData: any = {text: newTaskText, completed: false, group_id: selectedGroup || undefined};
                if (newTaskDeadline) taskData.deadline = new Date(newTaskDeadline).toISOString();
                const r = await fetch(`${baseUrl}/tasks?user_id=${userId}`, {
                    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(taskData), credentials: 'same-origin'
                });
                if (r.ok) {
                    this.setState({newTaskText: '', newTaskDeadline: ''});
                    await this.loadTasks();
                }
            } catch (e) {
                console.error('Error adding private task:', e);
            }
        } else {
            const channelId = this.getChannelId();
            if (!channelId) return;
            try {
                const taskData: any = {text: newTaskText, completed: false, group_id: selectedGroup || undefined};
                if (newTaskDeadline) taskData.deadline = new Date(newTaskDeadline).toISOString();
                const r = await fetch(`${baseUrl}/tasks?channel_id=${channelId}`, {
                    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(taskData), credentials: 'same-origin'
                });
                if (r.ok) {
                    this.setState({newTaskText: '', newTaskDeadline: ''});
                    await this.loadTasks();
                }
            } catch (e) {
                console.error('Error adding task:', e);
            }
        }
    };

    toggleTask = async (task: TaskItem) => {
        const baseUrl = this.getApiBaseUrl();

        if (this.state.privateTasks) {
            const userId = this.getUserId();
            if (!userId) return;
            try {
                await fetch(`${baseUrl}/tasks?user_id=${userId}`, {
                    method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...task, completed: !task.completed}), credentials: 'same-origin'
                });
                await this.loadTasks();
            } catch (e) {
                console.error('Error toggling private task:', e);
            }
        } else {
            const channelId = this.getChannelId();
            if (!channelId) return;
            try {
                await fetch(`${baseUrl}/tasks?channel_id=${channelId}`, {
                    method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...task, completed: !task.completed}), credentials: 'same-origin'
                });
                await this.loadTasks();
            } catch (e) {
                console.error('Error toggling task:', e);
            }
        }
    };

    updateTaskText = async (task: TaskItem, newText: string) => {
        const baseUrl = this.getApiBaseUrl();
        if (!newText.trim()) return;

        if (this.state.privateTasks) {
            const userId = this.getUserId();
            if (!userId) return;
            try {
                await fetch(`${baseUrl}/tasks?user_id=${userId}`, {
                    method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...task, text: newText}), credentials: 'same-origin'
                });
                await this.loadTasks();
            } catch (e) {
                console.error('Error updating private task text:', e);
            }
        } else {
            const channelId = this.getChannelId();
            if (!channelId) return;
            try {
                await fetch(`${baseUrl}/tasks?channel_id=${channelId}`, {
                    method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...task, text: newText}), credentials: 'same-origin'
                });
                await this.loadTasks();
            } catch (e) {
                console.error('Error updating task text:', e);
            }
        }
    };

    deleteTask = async (taskId: string) => {
        const baseUrl = this.getApiBaseUrl();

        if (this.state.privateTasks) {
            const userId = this.getUserId();
            if (!userId) return;
            try {
                await fetch(`${baseUrl}/tasks?user_id=${userId}&id=${taskId}`, {method: 'DELETE', credentials: 'same-origin'});
                await this.loadTasks();
            } catch (e) {
                console.error('Error deleting private task:', e);
            }
        } else {
            const channelId = this.getChannelId();
            if (!channelId) return;
            try {
                await fetch(`${baseUrl}/tasks?channel_id=${channelId}&id=${taskId}`, {method: 'DELETE', credentials: 'same-origin'});
                await this.loadTasks();
            } catch (e) {
                console.error('Error deleting task:', e);
            }
        }
    };

    showTaskNotes = async (task: TaskItem) => {
        this.setState({taskToShowNotes: task})
    };

    hideTaskNotes = () => {
        this.setState({taskToShowNotes: null});
    };

    updateTaskNotes = async (task: TaskItem, notes: string) => {
        const baseUrl = this.getApiBaseUrl();

        if (this.state.privateTasks) {
            const userId = this.getUserId();
            if (!userId) return;
            try {
                await fetch(`${baseUrl}/tasks?user_id=${userId}`, {
                    method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...task, notes}), credentials: 'same-origin'
                });
                await this.loadTasks();
            } catch (e) {
                console.error('Error updating private task notes:', e);
            }
        } else {
            const channelId = this.getChannelId();
            if (!channelId) return;
            try {
                await fetch(`${baseUrl}/tasks?channel_id=${channelId}`, {
                    method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...task, notes}), credentials: 'same-origin'
                });
                await this.loadTasks();
            } catch (e) {
                console.error('Error updating task notes:', e);
            }
        }
    }

    toggleAssignee = async (task: TaskItem, userId: string) => {
        if (this.state.privateTasks) return; // No assignees for private tasks

        const channelId = this.getChannelId();
        if (!channelId) return;
        const cur = task.assignee_ids || [];
        const newA = cur.includes(userId) ? cur.filter(id => id !== userId) : [...cur, userId];
        try {
            await fetch(`/plugins/com.mattermost.channel-task/api/v1/tasks?channel_id=${channelId}`, {
                method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...task, assignee_ids: newA})
            });
            await this.loadTasks();
        } catch (e) {
            console.error('Error toggling assignee:', e);
        }
    };

    addGroup = async () => {
        const {newGroupName, privateTasks} = this.state;
        const baseUrl = this.getApiBaseUrl();

        if (!newGroupName.trim()) return;

        if (privateTasks) {
            const userId = this.getUserId();
            if (!userId) return;
            try {
                const r = await fetch(`${baseUrl}/groups?user_id=${userId}`, {
                    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name: newGroupName}), credentials: 'same-origin'
                });
                if (r.ok) {
                    this.setState({newGroupName: ''});
                    await this.loadTasks();
                }
            } catch (e) {
                console.error('Error adding private group:', e);
            }
        } else {
            const channelId = this.getChannelId();
            if (!channelId) return;
            try {
                const r = await fetch(`${baseUrl}/groups?channel_id=${channelId}`, {
                    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name: newGroupName}), credentials: 'same-origin'
                });
                if (r.ok) {
                    this.setState({newGroupName: ''});
                    await this.loadTasks();
                }
            } catch (e) {
                console.error('Error adding group:', e);
            }
        }
    };

    confirmDeleteGroup = (groupId: string) => {
        const group = this.state.groups.find(g => g.id === groupId);
        if (!group) return;
        const tasksInGroup = this.state.tasks.filter(t => t.group_id === groupId);
        const taskCount = tasksInGroup.length;
        const dontWarn = localStorage.getItem('mattermost-task-dont-warn-delete-group') === 'true';
        if (dontWarn || taskCount === 0) {
            this.deleteGroup(groupId);
        } else {
            this.setState({deleteGroupWarningShown: true, groupToDelete: {id: groupId, name: group.name, taskCount}});
        }
    };

    deleteGroup = async (groupId: string) => {
        const baseUrl = this.getApiBaseUrl();

        if (this.state.privateTasks) {
            const userId = this.getUserId();
            if (!userId) return;
            try {
                const tasksInGroup = this.state.tasks.filter(t => t.group_id === groupId);
                for (const task of tasksInGroup) {
                    await fetch(`${baseUrl}/tasks?user_id=${userId}&id=${task.id}`, {method: 'DELETE', credentials: 'same-origin'});
                }
                await fetch(`${baseUrl}/groups?user_id=${userId}&id=${groupId}`, {method: 'DELETE', credentials: 'same-origin'});
                this.setState({deleteGroupWarningShown: false, groupToDelete: null});
                this.loadTasks();
            } catch (e) {
                console.error('Error deleting private group:', e);
            }
        } else {
            const channelId = this.getChannelId();
            if (!channelId) return;
            try {
                const tasksInGroup = this.state.tasks.filter(t => t.group_id === groupId);
                for (const task of tasksInGroup) {
                    await fetch(`${baseUrl}/tasks?channel_id=${channelId}&id=${task.id}`, {method: 'DELETE', credentials: 'same-origin'});
                }
                await fetch(`${baseUrl}/groups?channel_id=${channelId}&id=${groupId}`, {method: 'DELETE', credentials: 'same-origin'});
                this.setState({deleteGroupWarningShown: false, groupToDelete: null});
                this.loadTasks();
            } catch (e) {
                console.error('Error deleting group:', e);
            }
        }
    };

    cancelDeleteGroup = () => {
        this.setState({deleteGroupWarningShown: false, groupToDelete: null});
    };

    deleteGroupWithPreference = (dontWarn: boolean) => {
        if (dontWarn) localStorage.setItem('mattermost-task-dont-warn-delete-group', 'true');
        if (this.state.groupToDelete) this.deleteGroup(this.state.groupToDelete.id);
    };

    updateGroupName = async (group: TaskGroup, newName: string) => {
        const baseUrl = this.getApiBaseUrl();
        if (!newName.trim()) return;

        if (this.state.privateTasks) {
            const userId = this.getUserId();
            if (!userId) return;
            try {
                await fetch(`${baseUrl}/groups?user_id=${userId}`, {
                    method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...group, name: newName}), credentials: 'same-origin'
                });
                this.loadTasks();
            } catch (e) {
                console.error('Error updating private group name:', e);
            }
        } else {
            const channelId = this.getChannelId();
            if (!channelId) return;
            try {
                await fetch(`${baseUrl}/groups?channel_id=${channelId}`, {
                    method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...group, name: newName}), credentials: 'same-origin'
                });
                this.loadTasks();
            } catch (e) {
                console.error('Error updating group name:', e);
            }
        }
    };

    getCompletedTasks = () => this.state.tasks.filter(t => t.completed);

    confirmDeleteCompleted = () => {
        const completedTasks = this.getCompletedTasks();
        if (completedTasks.length === 0) return;
        const dontWarn = localStorage.getItem('mattermost-task-dont-warn-delete-completed') === 'true';
        if (dontWarn) {
            this.deleteCompletedTasks();
        } else {
            this.setState({deleteCompletedWarningShown: true});
        }
    };

    deleteCompletedTasks = async () => {
        const baseUrl = this.getApiBaseUrl();

        if (this.state.privateTasks) {
            const userId = this.getUserId();
            if (!userId) return;
            try {
                const completedTasks = this.getCompletedTasks();
                for (const task of completedTasks) {
                    await fetch(`${baseUrl}/tasks?user_id=${userId}&id=${task.id}`, {method: 'DELETE', credentials: 'same-origin'});
                }
                this.setState({deleteCompletedWarningShown: false});
                this.loadTasks();
            } catch (e) {
                console.error('Error deleting completed private tasks:', e);
            }
        } else {
            const channelId = this.getChannelId();
            if (!channelId) return;
            try {
                const completedTasks = this.getCompletedTasks();
                for (const task of completedTasks) {
                    await fetch(`${baseUrl}/tasks?channel_id=${channelId}&id=${task.id}`, {method: 'DELETE', credentials: 'same-origin'});
                }
                this.setState({deleteCompletedWarningShown: false});
                this.loadTasks();
            } catch (e) {
                console.error('Error deleting completed tasks:', e);
            }
        }
    };

    cancelDeleteCompleted = () => {
        this.setState({deleteCompletedWarningShown: false});
    };

    deleteCompletedWithPreference = (dontWarn: boolean) => {
        if (dontWarn) localStorage.setItem('mattermost-task-dont-warn-delete-completed', 'true');
        this.deleteCompletedTasks();
    };

    handleDragStart = (task: TaskItem) => {
        setTimeout(() => this.setState({draggedTask: task}), 0);
    };
    handleDragEnd = () => {
        this.setState({draggedTask: null, dragOverTaskId: null, dragOverPosition: null});
    };
    handleDragOverTask = (taskId: string, position: 'before' | 'after') => {
        if (this.state.draggedTask?.id === taskId) return;
        this.setState({dragOverTaskId: taskId, dragOverPosition: position});
    };
    handleDragLeaveTask = () => {
        this.setState({dragOverTaskId: null, dragOverPosition: null});
    };

    handleDropOnTask = async (targetTask: TaskItem, position: 'before' | 'after') => {
        const {draggedTask, privateTasks} = this.state;
        const baseUrl = this.getApiBaseUrl();

        if (!draggedTask || draggedTask.id === targetTask.id) {
            this.setState({draggedTask: null, dragOverTaskId: null, dragOverPosition: null});
            return;
        }

        const channelId = this.getChannelId();
        const userId = this.getUserId();
        if (!privateTasks && !channelId) {
            this.setState({draggedTask: null, dragOverTaskId: null, dragOverPosition: null});
            return;
        }
        if (privateTasks && !userId) {
            this.setState({draggedTask: null, dragOverTaskId: null, dragOverPosition: null});
            return;
        }

        try {
            const targetGroupId = targetTask.group_id || null;
            const tasksInGroup = this.state.tasks.filter(t => (t.group_id || null) === targetGroupId).sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
            const targetIndex = tasksInGroup.findIndex(t => t.id === targetTask.id);
            let newOrder: string;
            if (position === 'before' && targetIndex > 0) {
                const prevTask = tasksInGroup[targetIndex - 1];
                newOrder = new Date((new Date(prevTask.created_at).getTime() + new Date(targetTask.created_at).getTime()) / 2).toISOString();
            } else if (position === 'after' && targetIndex < tasksInGroup.length - 1) {
                const nextTask = tasksInGroup[targetIndex + 1];
                newOrder = new Date((new Date(targetTask.created_at).getTime() + new Date(nextTask.created_at).getTime()) / 2).toISOString();
            } else if (position === 'before') {
                newOrder = new Date(new Date(targetTask.created_at).getTime() - 1000).toISOString();
            } else {
                newOrder = new Date(new Date(targetTask.created_at).getTime() + 1000).toISOString();
            }

            const url = privateTasks ? `${baseUrl}/tasks?user_id=${userId}` : `${baseUrl}/tasks?channel_id=${channelId}`;
            const r = await fetch(url, {
                method: 'PUT', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({...draggedTask, group_id: targetGroupId || undefined, created_at: newOrder}),
                credentials: 'same-origin'
            });
            if (r.ok) {
                this.setState({draggedTask: null, dragOverTaskId: null, dragOverPosition: null});
                this.loadTasks();
            }
        } catch (e) {
            console.error('Error reordering task:', e);
            this.setState({draggedTask: null, dragOverTaskId: null, dragOverPosition: null});
        }
    };

    handleDrop = async (targetGroupId: string | null) => {
        const {draggedTask, privateTasks} = this.state;
        const baseUrl = this.getApiBaseUrl();

        if (!draggedTask) return;

        const channelId = this.getChannelId();
        const userId = this.getUserId();
        if (!privateTasks && !channelId) return;
        if (privateTasks && !userId) return;

        const curGroupId = draggedTask.group_id || null;
        if (curGroupId === targetGroupId) {
            this.setState({draggedTask: null});
            return;
        }
        try {
            const url = privateTasks ? `${baseUrl}/tasks?user_id=${userId}` : `${baseUrl}/tasks?channel_id=${channelId}`;
            const r = await fetch(url, {
                method: 'PUT', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({...draggedTask, group_id: targetGroupId || undefined}),
                credentials: 'same-origin'
            });
            if (r.ok) {
                this.setState({draggedTask: null});
                this.loadTasks();
            }
        } catch (e) {
            console.error('Error moving task:', e);
            this.setState({draggedTask: null});
        }
    };

    handleDragStartGroup = (group: TaskGroup) => {
        setTimeout(() => this.setState({draggedGroup: group}), 0);
    };
    handleDragEndGroup = () => {
        this.setState({draggedGroup: null, dragOverGroupId: null, dragOverGroupPosition: null});
    };
    handleDragOverGroup = (groupId: string, position: 'before' | 'after') => {
        if (this.state.draggedGroup?.id === groupId) return;
        this.setState({dragOverGroupId: groupId, dragOverGroupPosition: position});
    };
    handleDragLeaveGroup = () => {
        this.setState({dragOverGroupId: null, dragOverGroupPosition: null});
    };

    handleDropOnGroup = async (targetGroup: TaskGroup, position: 'before' | 'after') => {
        const {draggedGroup, privateTasks} = this.state;
        const baseUrl = this.getApiBaseUrl();

        if (!draggedGroup || draggedGroup.id === targetGroup.id) {
            this.setState({draggedGroup: null, dragOverGroupId: null, dragOverGroupPosition: null});
            return;
        }

        const channelId = this.getChannelId();
        const userId = this.getUserId();
        if (!privateTasks && !channelId) {
            this.setState({draggedGroup: null, dragOverGroupId: null, dragOverGroupPosition: null});
            return;
        }
        if (privateTasks && !userId) {
            this.setState({draggedGroup: null, dragOverGroupId: null, dragOverGroupPosition: null});
            return;
        }

        try {
            const sortedGroups = [...this.state.groups].sort((a, b) => (a.order || a.id).localeCompare(b.order || b.id));
            const targetIndex = sortedGroups.findIndex(g => g.id === targetGroup.id);
            let newOrder: string;
            const targetOrder = targetGroup.order || targetGroup.id;
            if (position === 'before' && targetIndex > 0) {
                const prevOrder = sortedGroups[targetIndex - 1].order || sortedGroups[targetIndex - 1].id;
                newOrder = prevOrder + '~' + targetOrder.substring(0, 1);
            } else if (position === 'after' && targetIndex < sortedGroups.length - 1) {
                const nextOrder = sortedGroups[targetIndex + 1].order || sortedGroups[targetIndex + 1].id;
                newOrder = targetOrder + '~' + nextOrder.substring(0, 1);
            } else if (position === 'before') {
                newOrder = targetOrder.substring(0, targetOrder.length - 1) + '!';
            } else {
                newOrder = targetOrder + '~';
            }

            const url = privateTasks ? `${baseUrl}/groups?user_id=${userId}` : `${baseUrl}/groups?channel_id=${channelId}`;
            const r = await fetch(url, {
                method: 'PUT', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({...draggedGroup, order: newOrder}),
                credentials: 'same-origin'
            });
            if (r.ok) {
                this.setState({draggedGroup: null, dragOverGroupId: null, dragOverGroupPosition: null});
                this.loadTasks();
            }
        } catch (e) {
            console.error('Error reordering group:', e);
            this.setState({draggedGroup: null, dragOverGroupId: null, dragOverGroupPosition: null});
        }
    };

    groupedTasks = (groupId: string | null) => {
        const {filterMyTasks, filterCompletion, filterDeadline, currentUserId, filterDeadlineCustomFrom, filterDeadlineCustomTo, privateTasks} = this.state;
        let filtered = this.state.tasks.filter(task => groupId === null ? !task.group_id : task.group_id === groupId);
        if (!privateTasks && filterMyTasks && currentUserId) filtered = filtered.filter(task => (task.assignee_ids || []).includes(currentUserId));
        if (filterCompletion === 'complete') filtered = filtered.filter(task => task.completed);
        else if (filterCompletion === 'incomplete') filtered = filtered.filter(task => !task.completed);
        if (filterDeadline === 'today') {
            filtered = filtered.filter(task => {
                if (!task.deadline) return false;
                return new Date(task.deadline).toDateString() === new Date().toDateString();
            });
        } else if (filterDeadline === 'one-week') {
            filtered = filtered.filter(task => {
                if (!task.deadline) return false;
                const taskDate = new Date(task.deadline), now = new Date();
                now.setHours(0, 0, 0, 0);
                const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                return taskDate.getTime() <= weekEnd.getTime() && taskDate.getTime() >= now.getTime();
            });
        } else if (filterDeadline === 'overdue') {
            filtered = filtered.filter(task => {
                if (!task.deadline) return false;
                const now = new Date();
                now.setHours(0, 0, 0, 0);
                return new Date(task.deadline).getTime() < now.getTime();
            });
        } else if (filterDeadline === 'custom') {
            filtered = filtered.filter(task => {
                if (!filterDeadlineCustomFrom && !filterDeadlineCustomTo) return true;
                if (!task.deadline) return false;
                const taskDate = new Date(task.deadline);
                const from = new Date(filterDeadlineCustomFrom || "0000-01-01");
                from.setHours(0, 0, 0, 0);
                const to = new Date(filterDeadlineCustomTo || "3000-01-01");
                to.setHours(23, 59, 59, 999);
                return taskDate.getTime() >= from.getTime() && taskDate.getTime() <= to.getTime();
            });
        }
        return filtered.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
    };

    getSortedGroups = () => [...this.state.groups].sort((a, b) => (a.order || a.id).localeCompare(b.order || b.id));

    render() {
        const {
            newTaskText, newGroupName, selectedGroup, newTaskDeadline, channelMembers, showGroupForm, showTaskForm,
            showFilters, draggedTask, filterMyTasks, filterCompletion, filterDeadline, filterDeadlineCustomFrom,
            filterDeadlineCustomTo, dragOverTaskId, dragOverPosition, draggedGroup, dragOverGroupId, dragOverGroupPosition,
            deleteGroupWarningShown, groupToDelete, hasEverHadTasks, showConfetti, deleteCompletedWarningShown,
            taskToShowNotes, privateTasks
        } = this.state;
        const theme = this.props.theme || {};
        const centerChannelBg = theme.centerChannelBg || '#ffffff';
        const centerChannelColor = theme.centerChannelColor || '#333333';
        const buttonBg = theme.buttonBg || '#1c58d9';
        const buttonColor = theme.buttonColor || '#ffffff';
        const onlineIndicator = theme.onlineIndicator || '#28a745';
        const errorTextColor = theme.errorTextColor || '#dc3545';
        const subtleBackground = adjustOpacity(centerChannelColor, centerChannelBg, 0.05);
        const borderColor = adjustOpacity(centerChannelColor, centerChannelBg, 0.1);
        const subtleText = adjustOpacity(centerChannelColor, centerChannelBg, 0.6);
        const isLightTheme = isHexLight(centerChannelBg);
        const sortedGroups = this.getSortedGroups();
        const allTasksComplete = hasEverHadTasks && this.state.tasks.length > 0 && this.state.tasks.every(t => t.completed);
        const noTasksExist = this.state.tasks.length === 0;
        const noFilteredTasks = this.state.tasks.length > 0 && sortedGroups.every(g => this.groupedTasks(g.id).length === 0) && this.groupedTasks(null).length === 0;
        const completedTasksCount = this.getCompletedTasks().length;

        return (
            <div style={{height: 'calc(100% - 50px)', display: 'flex', flexDirection: 'column', padding: '0', backgroundColor: centerChannelBg, color: centerChannelColor, position: 'relative'}}>
                <div style={{flex: 1, overflowY: 'auto', padding: '20px', paddingBottom: '80px', position: 'relative'}} onDragOver={(e) => e.preventDefault()}>
                    {showConfetti && <ConfettiAnimation theme={theme}/>}
                    <div style={{marginBottom: '20px', display: 'flex', gap: '8px'}}>
                        <button onClick={() => this.setState({showTaskForm: !showTaskForm, showGroupForm: false, showFilters: false})} style={{
                            flex: 1, padding: '8px 12px', fontSize: '14px', fontWeight: 500,
                            backgroundColor: showTaskForm ? buttonBg : subtleBackground,
                            color: showTaskForm ? buttonColor : centerChannelColor,
                            border: `1px solid ${borderColor}`, borderRadius: '4px', cursor: 'pointer', transition: 'all 0.2s'
                        }}>
                            {showTaskForm ? '− Add Task' : '+ Add Task'}
                        </button>
                        <button onClick={() => this.setState({showGroupForm: !showGroupForm, showTaskForm: false, showFilters: false})} style={{
                            flex: 1, padding: '8px 12px', fontSize: '14px', fontWeight: 500,
                            backgroundColor: showGroupForm ? onlineIndicator : subtleBackground,
                            color: showGroupForm ? '#ffffff' : centerChannelColor,
                            border: `1px solid ${borderColor}`, borderRadius: '4px', cursor: 'pointer', transition: 'all 0.2s'
                        }}>
                            {showGroupForm ? '− Add Group' : '+ Add Group'}
                        </button>
                        <button onClick={() => this.setState({showFilters: !showFilters, showGroupForm: false, showTaskForm: false}, () => this.saveFilterSettings())} style={{
                            flex: 1, padding: '8px 12px', fontSize: '14px', fontWeight: 500,
                            backgroundColor: showFilters ? buttonBg : subtleBackground,
                            color: showFilters ? buttonColor : centerChannelColor,
                            border: `1px solid ${borderColor}`, borderRadius: '4px', cursor: 'pointer', transition: 'all 0.2s'
                        }}>
                            {showFilters ? '− Filters' : '+ Filters'}
                        </button>
                    </div>

                    {showFilters && (
                        <div style={{marginBottom: '20px'}}>
                            {!privateTasks && (
                                <div style={{marginBottom: '12px', display: 'flex', gap: '0', border: `1px solid ${borderColor}`, borderRadius: '4px', overflow: 'hidden'}}>
                                    <button onClick={() => this.setState({filterMyTasks: false}, () => this.saveFilterSettings())} style={{
                                        flex: 1, padding: '8px 16px', fontSize: '14px', fontWeight: 500,
                                        backgroundColor: !filterMyTasks ? buttonBg : subtleBackground,
                                        color: !filterMyTasks ? buttonColor : centerChannelColor,
                                        border: 'none', borderRight: `1px solid ${borderColor}`, cursor: 'pointer', transition: 'all 0.2s', userSelect: 'none'
                                    }}>All
                                    </button>
                                    <button onClick={() => this.setState({filterMyTasks: true}, () => this.saveFilterSettings())} style={{
                                        flex: 1, padding: '8px 16px', fontSize: '14px', fontWeight: 500,
                                        backgroundColor: filterMyTasks ? buttonBg : subtleBackground,
                                        color: filterMyTasks ? buttonColor : centerChannelColor,
                                        border: 'none', cursor: 'pointer', transition: 'all 0.2s', userSelect: 'none'
                                    }}>Assigned to me
                                    </button>
                                </div>
                            )}
                            <div style={{marginBottom: '12px', display: 'flex', gap: '0', border: `1px solid ${borderColor}`, borderRadius: '4px', overflow: 'hidden'}}>
                                <button onClick={() => this.setState({filterCompletion: 'all'}, () => this.saveFilterSettings())} style={{
                                    flex: 1, padding: '8px 16px', fontSize: '14px', fontWeight: 500,
                                    backgroundColor: filterCompletion === 'all' ? buttonBg : subtleBackground,
                                    color: filterCompletion === 'all' ? buttonColor : centerChannelColor,
                                    border: 'none', borderRight: `1px solid ${borderColor}`, cursor: 'pointer', transition: 'all 0.2s', userSelect: 'none'
                                }}>All
                                </button>
                                <button onClick={() => this.setState({filterCompletion: 'complete'}, () => this.saveFilterSettings())} style={{
                                    flex: 1, padding: '8px 16px', fontSize: '14px', fontWeight: 500,
                                    backgroundColor: filterCompletion === 'complete' ? buttonBg : subtleBackground,
                                    color: filterCompletion === 'complete' ? buttonColor : centerChannelColor,
                                    border: 'none', borderRight: `1px solid ${borderColor}`, cursor: 'pointer', transition: 'all 0.2s', userSelect: 'none'
                                }}>Complete
                                </button>
                                <button onClick={() => this.setState({filterCompletion: 'incomplete'}, () => this.saveFilterSettings())} style={{
                                    flex: 1, padding: '8px 16px', fontSize: '14px', fontWeight: 500,
                                    backgroundColor: filterCompletion === 'incomplete' ? buttonBg : subtleBackground,
                                    color: filterCompletion === 'incomplete' ? buttonColor : centerChannelColor,
                                    border: 'none', cursor: 'pointer', transition: 'all 0.2s', userSelect: 'none'
                                }}>Incomplete
                                </button>
                            </div>
                            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: '0', border: `1px solid ${borderColor}`, borderRadius: '4px', overflow: 'hidden'}}>
                                <button onClick={() => this.setState({filterDeadline: 'all'}, () => this.saveFilterSettings())} style={{
                                    flex: 1, padding: '8px 16px', fontSize: '14px', fontWeight: 500,
                                    backgroundColor: filterDeadline === 'all' ? buttonBg : subtleBackground,
                                    color: filterDeadline === 'all' ? buttonColor : centerChannelColor,
                                    border: 'none', borderRight: `1px solid ${borderColor}`, borderBottom: `1px solid ${borderColor}`, cursor: 'pointer', transition: 'all 0.2s', userSelect: 'none'
                                }}>All
                                </button>
                                <button onClick={() => this.setState({filterDeadline: 'today'}, () => this.saveFilterSettings())} style={{
                                    flex: 1, padding: '8px 16px', fontSize: '14px', fontWeight: 500,
                                    backgroundColor: filterDeadline === 'today' ? buttonBg : subtleBackground,
                                    color: filterDeadline === 'today' ? buttonColor : centerChannelColor,
                                    border: 'none', borderBottom: `1px solid ${borderColor}`, cursor: 'pointer', transition: 'all 0.2s', userSelect: 'none'
                                }}>Due Today
                                </button>
                                <button onClick={() => this.setState({filterDeadline: 'one-week'}, () => this.saveFilterSettings())} style={{
                                    flex: 1, padding: '8px 16px', fontSize: '14px', fontWeight: 500,
                                    backgroundColor: filterDeadline === 'one-week' ? buttonBg : subtleBackground,
                                    color: filterDeadline === 'one-week' ? buttonColor : centerChannelColor,
                                    border: 'none', borderRight: `1px solid ${borderColor}`, borderBottom: `1px solid ${borderColor}`, cursor: 'pointer', transition: 'all 0.2s', userSelect: 'none'
                                }}>Due Within 1 Week
                                </button>
                                <button onClick={() => this.setState({filterDeadline: 'overdue'}, () => this.saveFilterSettings())} style={{
                                    flex: 1, padding: '8px 16px', fontSize: '14px', fontWeight: 500,
                                    backgroundColor: filterDeadline === 'overdue' ? buttonBg : subtleBackground,
                                    color: filterDeadline === 'overdue' ? buttonColor : centerChannelColor,
                                    border: 'none', borderBottom: `1px solid ${borderColor}`, cursor: 'pointer', transition: 'all 0.2s', userSelect: 'none'
                                }}>Past Due
                                </button>
                                <button onClick={() => this.setState({filterDeadline: 'custom'}, () => this.saveFilterSettings())} style={{
                                    flex: 1, padding: '8px 16px', fontSize: '14px', fontWeight: 500,
                                    backgroundColor: filterDeadline === 'custom' ? buttonBg : subtleBackground,
                                    color: filterDeadline === 'custom' ? buttonColor : centerChannelColor,
                                    border: 'none', cursor: 'pointer', transition: 'all 0.2s', userSelect: 'none', gridColumn: '1 / span 2'
                                }}>Custom Deadline Range
                                </button>
                            </div>
                        </div>
                    )}

                    {filterDeadline === 'custom' && (
                        <div style={{marginBottom: '20px', display: 'flex', flexWrap: 'wrap', gap: '5px'}}>
                            <label style={{flex: '200px 1 0', fontWeight: 'normal'}}>
                                <span style={{marginBottom: '4px', display: "block"}}>From:</span>
                                <input type='date' value={filterDeadlineCustomFrom} onChange={(e) => this.setState({filterDeadlineCustomFrom: e.target.value})}
                                       style={{width: '100%', padding: '10px', marginBottom: '8px', border: `1px solid ${borderColor}`, borderRadius: '4px', fontSize: '14px', backgroundColor: centerChannelBg, color: centerChannelColor}}/>
                            </label>
                            <label style={{flex: '200px 1 0', fontWeight: 'normal'}}>
                                <span style={{marginBottom: '4px', display: "block"}}>To:</span>
                                <input type='date' value={filterDeadlineCustomTo} onChange={(e) => this.setState({filterDeadlineCustomTo: e.target.value})}
                                       style={{width: '100%', padding: '10px', marginBottom: '8px', border: `1px solid ${borderColor}`, borderRadius: '4px', fontSize: '14px', backgroundColor: centerChannelBg, color: centerChannelColor}}/>
                            </label>
                        </div>
                    )}

                    {showTaskForm && (
                        <div style={{marginBottom: '20px'}}>
                            <label style={{width: '100%', fontWeight: "normal"}}>
                                <span style={{marginBottom: '4px', display: "block"}}>Task</span>
                                <input type="text" value={newTaskText} onChange={(e) => this.setState({newTaskText: e.target.value})} onKeyPress={(e) => e.key === 'Enter' && this.addTask()} placeholder="Add new task..."
                                       style={{width: '100%', padding: '10px', marginBottom: '8px', border: `1px solid ${borderColor}`, borderRadius: '4px', fontSize: '14px', backgroundColor: centerChannelBg, color: centerChannelColor}} autoFocus/>
                            </label>
                            <label style={{width: '100%', fontWeight: "normal", display: sortedGroups.length > 0 ? 'block' : 'none'}}>
                                <span style={{marginBottom: '4px', display: "block"}}>Group</span>
                                <select value={selectedGroup} onChange={(e) => this.setState({selectedGroup: e.target.value})}
                                        style={{width: '100%', padding: '10px', marginBottom: '8px', border: `1px solid ${borderColor}`, borderRadius: '4px', fontSize: '14px', backgroundColor: centerChannelBg, color: centerChannelColor}}>
                                    <option value="">No Group</option>
                                    {sortedGroups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
                                </select>
                            </label>
                            <label style={{width: '100%', fontWeight: "normal"}}>
                                <span style={{marginBottom: '4px', display: "block"}}>Deadline</span>
                                <div style={{position: 'relative'}}>
                                    <input type="date" value={newTaskDeadline} onChange={(e) => this.setState({newTaskDeadline: e.target.value})}
                                           style={{width: '100%', padding: '10px', paddingRight: newTaskDeadline ? '40px' : '10px', marginBottom: '8px', border: `1px solid ${borderColor}`, borderRadius: '4px', fontSize: '14px', backgroundColor: centerChannelBg, color: centerChannelColor, colorScheme: isLightTheme ? 'light' : 'dark'}}/>
                                    {newTaskDeadline && <button onClick={() => this.setState({newTaskDeadline: ''})}
                                                                style={{position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', padding: '4px 8px', fontSize: '14px', color: subtleText, backgroundColor: 'transparent', border: 'none', cursor: 'pointer', marginBottom: '8px'}}
                                                                title="Clear deadline">×</button>}
                                </div>
                            </label>
                            <button onClick={this.addTask} style={{width: '100%', padding: '10px', backgroundColor: buttonBg, color: buttonColor, border: 'none', borderRadius: '4px', fontSize: '14px', fontWeight: 600, cursor: 'pointer'}}>Add Task</button>
                        </div>
                    )}

                    {showGroupForm && (
                        <div style={{marginBottom: '20px'}}>
                            <input type="text" value={newGroupName} onChange={(e) => this.setState({newGroupName: e.target.value})} onKeyPress={(e) => e.key === 'Enter' && this.addGroup()} placeholder="Group name..."
                                   style={{width: '100%', padding: '10px', marginBottom: '8px', border: `1px solid ${borderColor}`, borderRadius: '4px', fontSize: '14px', backgroundColor: centerChannelBg, color: centerChannelColor}} autoFocus/>
                            <button onClick={this.addGroup} style={{width: '100%', padding: '10px', backgroundColor: onlineIndicator, color: '#ffffff', border: 'none', borderRadius: '4px', fontSize: '14px', fontWeight: 600, cursor: 'pointer'}}>Create Group</button>
                        </div>
                    )}

                    {sortedGroups.map(group => (
                        <TaskGroupSection key={group.id} title={group.name} groupId={group.id} group={group} tasks={this.groupedTasks(group.id)} channelMembers={privateTasks ? [] : channelMembers} onToggle={this.toggleTask} onDelete={this.deleteTask} onToggleAssignee={this.toggleAssignee}
                                          onUpdateText={this.updateTaskText} onDeleteGroup={() => this.confirmDeleteGroup(group.id)} onUpdateGroupName={this.updateGroupName} onDragStart={this.handleDragStart} onDragEnd={this.handleDragEnd} onDrop={this.handleDrop}
                                          onDragOverTask={this.handleDragOverTask} onDragLeaveTask={this.handleDragLeaveTask} onDropOnTask={this.handleDropOnTask} isDragging={!!draggedTask} dragOverTaskId={dragOverTaskId} dragOverPosition={dragOverPosition}
                                          onDragStartGroup={this.handleDragStartGroup} onDragEndGroup={this.handleDragEndGroup} onDragOverGroup={this.handleDragOverGroup} onDragLeaveGroup={this.handleDragLeaveGroup} onDropOnGroup={this.handleDropOnGroup} isDraggingGroup={!!draggedGroup}
                                          isDropTargetGroup={dragOverGroupId === group.id} dropPositionGroup={dragOverGroupId === group.id ? dragOverGroupPosition : null} theme={theme} showNotes={this.showTaskNotes} hideAssignees={privateTasks}/>
                    ))}

                    <TaskGroupSection title="Ungrouped" groupId={null} group={null} tasks={this.groupedTasks(null)} channelMembers={privateTasks ? [] : channelMembers} onToggle={this.toggleTask} onDelete={this.deleteTask} onToggleAssignee={this.toggleAssignee} onUpdateText={this.updateTaskText}
                                      onDragStart={this.handleDragStart} onDragEnd={this.handleDragEnd} onDrop={this.handleDrop} onDragOverTask={this.handleDragOverTask} onDragLeaveTask={this.handleDragLeaveTask} onDropOnTask={this.handleDropOnTask} isDragging={!!draggedTask}
                                      dragOverTaskId={dragOverTaskId} dragOverPosition={dragOverPosition} onDragStartGroup={this.handleDragStartGroup} onDragEndGroup={this.handleDragEndGroup} onDragOverGroup={this.handleDragOverGroup} onDragLeaveGroup={this.handleDragLeaveGroup}
                                      onDropOnGroup={this.handleDropOnGroup} isDraggingGroup={!!draggedGroup} isDropTargetGroup={false} dropPositionGroup={null} theme={theme} showNotes={this.showTaskNotes} hideAssignees={privateTasks}/>

                    {noTasksExist && !hasEverHadTasks && (
                        <div style={{textAlign: 'center', padding: '40px 20px', color: subtleText}}>
                            {privateTasks ? 'No private tasks yet. Add one above to get started!' : 'No tasks yet. Add one above to get started!'}
                        </div>
                    )}

                    {noTasksExist && hasEverHadTasks && (
                        <div style={{textAlign: 'center', padding: '40px 20px', color: onlineIndicator, position: 'relative'}}>
                            {showConfetti && <ConfettiAnimation theme={theme}/>}
                            <div style={{fontSize: '48px', marginBottom: '12px'}}>🎉</div>
                            <div style={{fontSize: '18px', fontWeight: 600}}>All tasks are complete!</div>
                        </div>
                    )}

                    {allTasksComplete && !noTasksExist && (
                        <div style={{textAlign: 'center', padding: '40px 20px', color: onlineIndicator, position: 'relative'}}>
                            <div style={{fontSize: '48px', marginBottom: '12px'}}>🎉</div>
                            <div style={{fontSize: '18px', fontWeight: 600}}>All tasks are complete!</div>
                        </div>
                    )}

                    {noFilteredTasks && !allTasksComplete && (
                        <div style={{textAlign: 'center', padding: '40px 20px', color: subtleText}}>
                            No tasks match the current filters.
                        </div>
                    )}
                </div>

                <button onClick={() => {
                    if (this.props.onTogglePrivate) {
                        this.props.onTogglePrivate();
                    }
                }} style={{
                    padding: '12px', fontSize: '14px', fontWeight: 500,
                    backgroundColor: subtleBackground,
                    color: centerChannelColor,
                    borderRadius: '8px', border: 'none', cursor: 'pointer', transition: 'all 0.2s', userSelect: 'none',
                    position: 'absolute', bottom: '20px', left: '20px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)', display: 'flex', alignItems: 'center', gap: '4px', zIndex: 100
                }}>
                    {privateTasks ? 'Show Channel' : 'Show Private'}
                </button>

                {completedTasksCount > 0 && (
                    <button
                        onClick={this.confirmDeleteCompleted}
                        style={{
                            position: 'absolute', bottom: '20px', right: '20px', padding: '12px', fontSize: '14px', fontWeight: 500,
                            backgroundColor: errorTextColor, color: '#ffffff', border: 'none', borderRadius: '8px', cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)', display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.2s', zIndex: 100
                        }}
                        title={`Delete ${completedTasksCount} completed task${completedTasksCount !== 1 ? 's' : ''}`}
                    >
                        <span>
                            <i className="icon icon-trash-can-outline" style={{fontSize: '16px'}}/>
                            <i className="icon icon-check" style={{fontSize: '16px'}}/>
                        </span>
                        {completedTasksCount}
                    </button>
                )}

                {deleteGroupWarningShown && groupToDelete && (
                    <DeleteGroupWarning groupName={groupToDelete.name} taskCount={groupToDelete.taskCount} onConfirm={this.deleteGroupWithPreference} onCancel={this.cancelDeleteGroup} theme={theme}/>
                )}

                {deleteCompletedWarningShown && (
                    <DeleteCompletedWarning taskCount={completedTasksCount} onConfirm={this.deleteCompletedWithPreference} onCancel={this.cancelDeleteCompleted} theme={theme}/>
                )}

                {taskToShowNotes && (
                    <TaskItemNotes task={taskToShowNotes} hideTaskNotes={this.hideTaskNotes} updateTaskNotes={this.updateTaskNotes} bg={adjustOpacity(centerChannelColor, centerChannelBg, 0.05)} subtleBackground={adjustOpacity(centerChannelColor, centerChannelBg, 0.1)} buttonBg={buttonBg} buttonColor={centerChannelColor} borderColor={adjustOpacity(centerChannelColor, centerChannelBg, 0.15)} shadowColor={adjustOpacity(centerChannelColor, centerChannelBg, 0.1)}></TaskItemNotes>
                )}
            </div>
        );
    }
}