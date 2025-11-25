import React from 'react';
import { TaskItem, TaskGroup, ChannelTaskList } from '../types';
import { adjustOpacity } from '../utils';
import { TaskGroupSection } from './TaskGroupSection';
import { DeleteGroupWarning } from './DeleteGroupWarning';

interface TaskSidebarProps {
    channelId?: string;
    channel?: any;
    theme?: any;
    onChannelChange?: (callback: () => void) => void;
}

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
    };

    componentDidMount() {
        console.log('TaskSidebar mounted with props:', this.props);
        this.loadFilterSettings();
        this.loadCurrentUser();
        this.loadTasks();
        this.loadChannelMembers();

        // Subscribe to channel changes if onChannelChange prop is provided
        if (this.props.onChannelChange) {
            this.props.onChannelChange(() => {
                console.log('Channel changed, reloading data');
                this.loadTasks();
                this.loadChannelMembers();
            });
        }
    }

    componentWillUnmount() {
        // No cleanup needed anymore
    }

    componentDidUpdate(prevProps: any) {
        const prevChannelId = this.getChannelId(prevProps);
        const currentChannelId = this.getChannelId(this.props);

        if (prevChannelId && currentChannelId && prevChannelId !== currentChannelId) {
            console.log('Channel changed via props from', prevChannelId, 'to', currentChannelId);
            this.setState({ _lastChannelId: currentChannelId });
            this.loadTasks();
            this.loadChannelMembers();
        }
    }

    getChannelId(props = this.props) {
        return props.channelId ||
            props.channel?.id ||
            (window as any).store?.getState()?.entities?.channels?.currentChannelId;
    }

    loadFilterSettings = () => {
        try {
            const savedFilters = localStorage.getItem('mattermost-task-filters');
            if (savedFilters) {
                const filters = JSON.parse(savedFilters);
                this.setState({
                    filterMyTasks: filters.filterMyTasks ?? false,
                    filterCompletion: filters.filterCompletion ?? 'all',
                    filterDeadline: filters.filterDeadline ?? 'all',
                    showFilters: filters.showFilters ?? false
                });
            }
        } catch (error) {
            console.error('Error loading filter settings:', error);
        }
    };

    saveFilterSettings = () => {
        try {
            const filters = {
                filterMyTasks: this.state.filterMyTasks,
                filterCompletion: this.state.filterCompletion,
                filterDeadline: this.state.filterDeadline,
                showFilters: this.state.showFilters
            };
            localStorage.setItem('mattermost-task-filters', JSON.stringify(filters));
        } catch (error) {
            console.error('Error saving filter settings:', error);
        }
    };

    loadCurrentUser = async () => {
        try {
            const response = await fetch('/api/v4/users/me');
            const user = await response.json();
            this.setState({ currentUserId: user.id });
        } catch (error) {
            console.error('Error loading current user:', error);
        }
    };

    loadTasks = async () => {
        const channelId = this.getChannelId();
        console.log('Loading tasks for channel:', channelId);
        if (!channelId) return;

        try {
            const response = await fetch(`/plugins/com.mattermost.channel-task/api/v1/tasks?channel_id=${channelId}`);
            const data: ChannelTaskList = await response.json();
            this.setState({ tasks: data.items, groups: data.groups });
        } catch (error) {
            console.error('Error loading tasks:', error);
        }
    };

    loadChannelMembers = async () => {
        const channelId = this.getChannelId();
        if (!channelId) return;

        try {
            const response = await fetch(`/api/v4/channels/${channelId}/members`);
            const members = await response.json();

            const usersPromises = members.map((m: any) =>
                fetch(`/api/v4/users/${m.user_id}`).then(r => r.json())
            );
            const users = await Promise.all(usersPromises);
            this.setState({ channelMembers: users });
        } catch (error) {
            console.error('Error loading channel members:', error);
        }
    };

    addTask = async () => {
        const { newTaskText, selectedGroup, newTaskDeadline } = this.state;
        const channelId = this.getChannelId();
        console.log('Adding task:', newTaskText, 'for channel:', channelId);
        if (!newTaskText.trim() || !channelId) return;

        try {
            console.log('Sending POST request to add task');
            const taskData: any = {
                text: newTaskText,
                completed: false,
                group_id: selectedGroup || undefined
            };

            if (newTaskDeadline) {
                taskData.deadline = new Date(newTaskDeadline).toISOString();
            }

            const response = await fetch(`/plugins/com.mattermost.channel-task/api/v1/tasks?channel_id=${channelId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(taskData)
            });

            console.log('Add task response:', response.status, response.ok);
            if (response.ok) {
                this.setState({
                    newTaskText: '',
                    newTaskDeadline: ''
                });
                this.loadTasks();
            } else {
                console.error('Failed to add task:', await response.text());
            }
        } catch (error) {
            console.error('Error adding task:', error);
        }
    };

    toggleTask = async (task: TaskItem) => {
        const channelId = this.getChannelId();
        if (!channelId) return;

        try {
            await fetch(`/plugins/com.mattermost.channel-task/api/v1/tasks?channel_id=${channelId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...task,
                    completed: !task.completed
                })
            });
            this.loadTasks();
        } catch (error) {
            console.error('Error toggling task:', error);
        }
    };

    updateTaskText = async (task: TaskItem, newText: string) => {
        const channelId = this.getChannelId();
        if (!channelId || !newText.trim()) return;

        try {
            await fetch(`/plugins/com.mattermost.channel-task/api/v1/tasks?channel_id=${channelId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...task,
                    text: newText
                })
            });
            this.loadTasks();
        } catch (error) {
            console.error('Error updating task text:', error);
        }
    };

    deleteTask = async (taskId: string) => {
        const channelId = this.getChannelId();
        if (!channelId) return;

        try {
            await fetch(`/plugins/com.mattermost.channel-task/api/v1/tasks?channel_id=${channelId}&id=${taskId}`, {
                method: 'DELETE'
            });
            this.loadTasks();
        } catch (error) {
            console.error('Error deleting task:', error);
        }
    };

    toggleAssignee = async (task: TaskItem, userId: string) => {
        const channelId = this.getChannelId();
        if (!channelId) return;

        const currentAssignees = task.assignee_ids || [];

        let newAssignees;
        if (currentAssignees.includes(userId)) {
            newAssignees = currentAssignees.filter(id => id !== userId);
        } else {
            newAssignees = [...currentAssignees, userId];
        }

        try {
            await fetch(`/plugins/com.mattermost.channel-task/api/v1/tasks?channel_id=${channelId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...task,
                    assignee_ids: newAssignees
                })
            });
            this.loadTasks();
        } catch (error) {
            console.error('Error toggling assignee:', error);
        }
    };

    addGroup = async () => {
        const { newGroupName } = this.state;
        const channelId = this.getChannelId();
        console.log('Adding group:', newGroupName, 'for channel:', channelId);
        if (!newGroupName.trim() || !channelId) return;

        try {
            console.log('Sending POST request to add group');
            const response = await fetch(`/plugins/com.mattermost.channel-task/api/v1/groups?channel_id=${channelId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newGroupName })
            });
            console.log('Add group response:', response.status, response.ok);
            if (response.ok) {
                this.setState({ newGroupName: '' });
                this.loadTasks();
            } else {
                console.error('Failed to add group:', await response.text());
            }
        } catch (error) {
            console.error('Error adding group:', error);
        }
    };

    confirmDeleteGroup = (groupId: string) => {
        const group = this.state.groups.find(g => g.id === groupId);
        if (!group) return;

        const tasksInGroup = this.state.tasks.filter(t => t.group_id === groupId);
        const taskCount = tasksInGroup.length;

        const dontWarnAgain = localStorage.getItem('mattermost-task-dont-warn-delete-group') === 'true';

        if (dontWarnAgain || taskCount === 0) {
            this.deleteGroup(groupId);
        } else {
            this.setState({
                deleteGroupWarningShown: true,
                groupToDelete: { id: groupId, name: group.name, taskCount }
            });
        }
    };

    deleteGroup = async (groupId: string) => {
        const channelId = this.getChannelId();
        if (!channelId) return;

        try {
            // Delete all tasks in the group
            const tasksInGroup = this.state.tasks.filter(t => t.group_id === groupId);
            for (const task of tasksInGroup) {
                await fetch(`/plugins/com.mattermost.channel-task/api/v1/tasks?channel_id=${channelId}&id=${task.id}`, {
                    method: 'DELETE'
                });
            }

            // Delete the group
            await fetch(`/plugins/com.mattermost.channel-task/api/v1/groups?channel_id=${channelId}&id=${groupId}`, {
                method: 'DELETE'
            });

            this.setState({ deleteGroupWarningShown: false, groupToDelete: null });
            this.loadTasks();
        } catch (error) {
            console.error('Error deleting group:', error);
        }
    };

    cancelDeleteGroup = () => {
        this.setState({ deleteGroupWarningShown: false, groupToDelete: null });
    };

    deleteGroupWithPreference = (dontWarnAgain: boolean) => {
        if (dontWarnAgain) {
            localStorage.setItem('mattermost-task-dont-warn-delete-group', 'true');
        }
        if (this.state.groupToDelete) {
            this.deleteGroup(this.state.groupToDelete.id);
        }
    };

    updateGroupName = async (group: TaskGroup, newName: string) => {
        const channelId = this.getChannelId();
        if (!channelId || !newName.trim()) return;

        try {
            await fetch(`/plugins/com.mattermost.channel-task/api/v1/groups?channel_id=${channelId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...group,
                    name: newName
                })
            });
            this.loadTasks();
        } catch (error) {
            console.error('Error updating group name:', error);
        }
    };

    handleDragStart = (task: TaskItem) => {
        console.log('Parent: handleDragStart called for task:', task.text);
        setTimeout(() => {
            this.setState({ draggedTask: task });
        }, 0);
    };

    handleDragEnd = () => {
        console.log('handleDragEnd - clearing dragged task');
        this.setState({
            draggedTask: null,
            dragOverTaskId: null,
            dragOverPosition: null
        });
    };

    handleDragOverTask = (taskId: string, position: 'before' | 'after') => {
        if (this.state.draggedTask?.id === taskId) {
            return;
        }
        this.setState({
            dragOverTaskId: taskId,
            dragOverPosition: position
        });
    };

    handleDragLeaveTask = () => {
        this.setState({
            dragOverTaskId: null,
            dragOverPosition: null
        });
    };

    handleDropOnTask = async (targetTask: TaskItem, position: 'before' | 'after') => {
        const { draggedTask } = this.state;
        const channelId = this.getChannelId();

        console.log('handleDropOnTask called:', { draggedTask, targetTask, position, channelId });

        if (!draggedTask || !channelId || draggedTask.id === targetTask.id) {
            this.setState({
                draggedTask: null,
                dragOverTaskId: null,
                dragOverPosition: null
            });
            return;
        }

        try {
            const targetGroupId = targetTask.group_id || null;
            const tasksInGroup = this.state.tasks
                .filter(t => (t.group_id || null) === targetGroupId)
                .sort((a, b) => {
                    const aOrder = a.created_at || '';
                    const bOrder = b.created_at || '';
                    return aOrder.localeCompare(bOrder);
                });

            const targetIndex = tasksInGroup.findIndex(t => t.id === targetTask.id);

            let newOrder: string;
            if (position === 'before' && targetIndex > 0) {
                const prevTask = tasksInGroup[targetIndex - 1];
                const targetOrder = new Date(targetTask.created_at).getTime();
                const prevOrder = new Date(prevTask.created_at).getTime();
                newOrder = new Date((prevOrder + targetOrder) / 2).toISOString();
            } else if (position === 'after' && targetIndex < tasksInGroup.length - 1) {
                const nextTask = tasksInGroup[targetIndex + 1];
                const targetOrder = new Date(targetTask.created_at).getTime();
                const nextOrder = new Date(nextTask.created_at).getTime();
                newOrder = new Date((targetOrder + nextOrder) / 2).toISOString();
            } else if (position === 'before') {
                newOrder = new Date(new Date(targetTask.created_at).getTime() - 1000).toISOString();
            } else {
                newOrder = new Date(new Date(targetTask.created_at).getTime() + 1000).toISOString();
            }

            const response = await fetch(`/plugins/com.mattermost.channel-task/api/v1/tasks?channel_id=${channelId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...draggedTask,
                    group_id: targetGroupId || undefined,
                    created_at: newOrder
                })
            });

            if (response.ok) {
                console.log('Task reordered successfully');
                this.setState({
                    draggedTask: null,
                    dragOverTaskId: null,
                    dragOverPosition: null
                });
                this.loadTasks();
            } else {
                console.error('Failed to reorder task:', response.status);
            }
        } catch (error) {
            console.error('Error reordering task:', error);
            this.setState({
                draggedTask: null,
                dragOverTaskId: null,
                dragOverPosition: null
            });
        }
    };

    handleDrop = async (targetGroupId: string | null) => {
        const { draggedTask } = this.state;
        const channelId = this.getChannelId();

        console.log('handleDrop called:', { draggedTask, targetGroupId, channelId });

        if (!draggedTask || !channelId) {
            console.log('No dragged task or channel ID');
            return;
        }

        const currentGroupId = draggedTask.group_id || null;
        if (currentGroupId === targetGroupId) {
            console.log('Same group, no update needed');
            this.setState({ draggedTask: null });
            return;
        }

        console.log('Updating task group from', currentGroupId, 'to', targetGroupId);

        try {
            const response = await fetch(`/plugins/com.mattermost.channel-task/api/v1/tasks?channel_id=${channelId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...draggedTask,
                    group_id: targetGroupId || undefined
                })
            });

            if (response.ok) {
                console.log('Task updated successfully');
                this.setState({ draggedTask: null });
                this.loadTasks();
            } else {
                console.error('Failed to update task:', response.status);
            }
        } catch (error) {
            console.error('Error moving task:', error);
            this.setState({ draggedTask: null });
        }
    };

    handleDragStartGroup = (group: TaskGroup) => {
        console.log('handleDragStartGroup called for group:', group.name);
        setTimeout(() => {
            this.setState({ draggedGroup: group });
        }, 0);
    };

    handleDragEndGroup = () => {
        console.log('handleDragEndGroup - clearing dragged group');
        this.setState({
            draggedGroup: null,
            dragOverGroupId: null,
            dragOverGroupPosition: null
        });
    };

    handleDragOverGroup = (groupId: string, position: 'before' | 'after') => {
        if (this.state.draggedGroup?.id === groupId) {
            return;
        }
        this.setState({
            dragOverGroupId: groupId,
            dragOverGroupPosition: position
        });
    };

    handleDragLeaveGroup = () => {
        this.setState({
            dragOverGroupId: null,
            dragOverGroupPosition: null
        });
    };

    handleDropOnGroup = async (targetGroup: TaskGroup, position: 'before' | 'after') => {
        const { draggedGroup } = this.state;
        const channelId = this.getChannelId();

        console.log('handleDropOnGroup called:', { draggedGroup, targetGroup, position, channelId });

        if (!draggedGroup || !channelId || draggedGroup.id === targetGroup.id) {
            this.setState({
                draggedGroup: null,
                dragOverGroupId: null,
                dragOverGroupPosition: null
            });
            return;
        }

        try {
            const sortedGroups = [...this.state.groups].sort((a, b) => {
                const aOrder = a.order || a.id;
                const bOrder = b.order || b.id;
                return aOrder.localeCompare(bOrder);
            });

            const targetIndex = sortedGroups.findIndex(g => g.id === targetGroup.id);

            let newOrder: string;
            if (position === 'before' && targetIndex > 0) {
                const prevGroup = sortedGroups[targetIndex - 1];
                const targetOrder = targetGroup.order || targetGroup.id;
                const prevOrder = prevGroup.order || prevGroup.id;
                newOrder = prevOrder + '~' + targetOrder.substring(0, 1);
            } else if (position === 'after' && targetIndex < sortedGroups.length - 1) {
                const nextGroup = sortedGroups[targetIndex + 1];
                const targetOrder = targetGroup.order || targetGroup.id;
                const nextOrder = nextGroup.order || nextGroup.id;
                newOrder = targetOrder + '~' + nextOrder.substring(0, 1);
            } else if (position === 'before') {
                const targetOrder = targetGroup.order || targetGroup.id;
                newOrder = targetOrder.substring(0, targetOrder.length - 1) + '!';
            } else {
                const targetOrder = targetGroup.order || targetGroup.id;
                newOrder = targetOrder + '~';
            }

            const response = await fetch(`/plugins/com.mattermost.channel-task/api/v1/groups?channel_id=${channelId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...draggedGroup,
                    order: newOrder
                })
            });

            if (response.ok) {
                console.log('Group reordered successfully');
                this.setState({
                    draggedGroup: null,
                    dragOverGroupId: null,
                    dragOverGroupPosition: null
                });
                this.loadTasks();
            } else {
                console.error('Failed to reorder group:', response.status);
            }
        } catch (error) {
            console.error('Error reordering group:', error);
            this.setState({
                draggedGroup: null,
                dragOverGroupId: null,
                dragOverGroupPosition: null
            });
        }
    };

    groupedTasks = (groupId: string | null) => {
        const { filterMyTasks, filterCompletion, filterDeadline, currentUserId } = this.state;

        let filtered = this.state.tasks.filter(task => {
            if (groupId === null) {
                return !task.group_id;
            }
            return task.group_id === groupId;
        });

        if (filterMyTasks && currentUserId) {
            filtered = filtered.filter(task => {
                const assigneeIds = task.assignee_ids || [];
                return assigneeIds.includes(currentUserId);
            });
        }

        if (filterCompletion === 'complete') {
            filtered = filtered.filter(task => task.completed);
        } else if (filterCompletion === 'incomplete') {
            filtered = filtered.filter(task => !task.completed);
        }

        if (filterDeadline === 'today') {
            filtered = filtered.filter(task => {
                if (!task.deadline) return false;
                const taskDate = new Date(task.deadline);
                const now = new Date();
                return taskDate.toDateString() === now.toDateString();
            });
        } else if (filterDeadline === 'one-week') {
            filtered = filtered.filter(task => {
                if (!task.deadline) return false;
                const taskDate = new Date(task.deadline);
                const now = new Date();
                now.setHours(0, 0, 0, 0);
                const twoWeeksDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                return taskDate.getTime() <= twoWeeksDate.getTime() && taskDate.getTime() >= now.getTime();
            });
        } else if (filterDeadline === 'overdue') {
            filtered = filtered.filter(task => {
                if (!task.deadline) return false;
                const taskDate = new Date(task.deadline);
                const now = new Date();
                now.setHours(0, 0, 0, 0);
                return taskDate.getTime() < now.getTime();
            });
        } else if (filterDeadline === 'custom') {
            filtered = filtered.filter(task => {
                if (!this.state.filterDeadlineCustomFrom && !this.state.filterDeadlineCustomTo) return true;
                if (!task.deadline) return false;

                const taskDate = new Date(task.deadline);
                const from = new Date(this.state.filterDeadlineCustomFrom || "0000-01-01");
                from.setHours(0, 0, 0, 0);
                const to = new Date(this.state.filterDeadlineCustomTo || "3000-01-01");
                to.setHours(23, 59, 59, 999);
                return taskDate.getTime() >= from.getTime() && taskDate.getTime() <= to.getTime();
            });
        }

        return filtered.sort((a, b) => {
            const aOrder = a.created_at || '';
            const bOrder = b.created_at || '';
            return aOrder.localeCompare(bOrder);
        });
    };

    getSortedGroups = () => {
        return [...this.state.groups].sort((a, b) => {
            const aOrder = a.order || a.id;
            const bOrder = b.order || b.id;
            return aOrder.localeCompare(bOrder);
        });
    };

    render() {
        const { newTaskText, newGroupName, selectedGroup, newTaskDeadline, channelMembers, showGroupForm, showTaskForm, showFilters, draggedTask, filterMyTasks, filterCompletion, filterDeadline, filterDeadlineCustomFrom, filterDeadlineCustomTo, dragOverTaskId, dragOverPosition, draggedGroup, dragOverGroupId, dragOverGroupPosition, deleteGroupWarningShown, groupToDelete } = this.state;

        const theme = this.props.theme || {};

        const centerChannelBg = theme.centerChannelBg || '#ffffff';
        const centerChannelColor = theme.centerChannelColor || '#333333';
        const buttonBg = theme.buttonBg || '#1c58d9';
        const buttonColor = theme.buttonColor || '#ffffff';
        const onlineIndicator = theme.onlineIndicator || '#28a745';

        const subtleBackground = adjustOpacity(centerChannelColor, centerChannelBg, 0.05);
        const borderColor = adjustOpacity(centerChannelColor, centerChannelBg, 0.1);
        const subtleText = adjustOpacity(centerChannelColor, centerChannelBg, 0.6);

        const sortedGroups = this.getSortedGroups();

        return (
            <div
                style={{
                    height: 'calc(100% - 50px)',
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '0',
                    backgroundColor: centerChannelBg,
                    color: centerChannelColor
                }}
            >
                <div
                    style={{ flex: 1, overflowY: 'auto', padding: '20px' }}
                    onDragOver={(e) => e.preventDefault()}
                >
                    <div style={{
                        marginBottom: '20px',
                        display: 'flex',
                        gap: '8px'
                    }}>
                        <button
                            onClick={() => this.setState({ showTaskForm: !showTaskForm, showGroupForm: false, showFilters: false })}
                            style={{
                                flex: 1,
                                padding: '8px 12px',
                                fontSize: '14px',
                                fontWeight: 500,
                                backgroundColor: showTaskForm ? buttonBg : subtleBackground,
                                color: showTaskForm ? buttonColor : centerChannelColor,
                                border: `1px solid ${borderColor}`,
                                borderRadius: '4px',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            {showTaskForm ? '− Add Task' : '+ Add Task'}
                        </button>
                        <button
                            onClick={() => this.setState({ showGroupForm: !showGroupForm, showTaskForm: false, showFilters: false })}
                            style={{
                                flex: 1,
                                padding: '8px 12px',
                                fontSize: '14px',
                                fontWeight: 500,
                                backgroundColor: showGroupForm ? onlineIndicator : subtleBackground,
                                color: showGroupForm ? '#ffffff' : centerChannelColor,
                                border: `1px solid ${borderColor}`,
                                borderRadius: '4px',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            {showGroupForm ? '− Add Group' : '+ Add Group'}
                        </button>
                        <button
                            onClick={() => this.setState({ showFilters: !showFilters, showGroupForm: false, showTaskForm: false }, () => this.saveFilterSettings())}
                            style={{
                                flex: 1,
                                padding: '8px 12px',
                                fontSize: '14px',
                                fontWeight: 500,
                                backgroundColor: showFilters ? buttonBg : subtleBackground,
                                color: showFilters ? buttonColor : centerChannelColor,
                                border: `1px solid ${borderColor}`,
                                borderRadius: '4px',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            {showFilters ? '− Filters' : '+ Filters'}
                        </button>
                    </div>

                    {showFilters && (
                        <div style={{ marginBottom: '20px' }}>
                            <div style={{
                                marginBottom: '12px',
                                display: 'flex',
                                gap: '0',
                                border: `1px solid ${borderColor}`,
                                borderRadius: '4px',
                                overflow: 'hidden'
                            }}>
                                <button
                                    onClick={() => this.setState({ filterMyTasks: false }, () => this.saveFilterSettings())}
                                    style={{
                                        flex: 1,
                                        padding: '8px 16px',
                                        fontSize: '14px',
                                        fontWeight: 500,
                                        backgroundColor: !filterMyTasks ? buttonBg : subtleBackground,
                                        color: !filterMyTasks ? buttonColor : centerChannelColor,
                                        border: 'none',
                                        borderRight: `1px solid ${borderColor}`,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        userSelect: 'none'
                                    }}
                                >
                                    All
                                </button>
                                <button
                                    onClick={() => this.setState({ filterMyTasks: true }, () => this.saveFilterSettings())}
                                    style={{
                                        flex: 1,
                                        padding: '8px 16px',
                                        fontSize: '14px',
                                        fontWeight: 500,
                                        backgroundColor: filterMyTasks ? buttonBg : subtleBackground,
                                        color: filterMyTasks ? buttonColor : centerChannelColor,
                                        border: 'none',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        userSelect: 'none'
                                    }}
                                >
                                    Assigned to me
                                </button>
                            </div>

                            <div style={{
                                marginBottom: '12px',
                                display: 'flex',
                                gap: '0',
                                border: `1px solid ${borderColor}`,
                                borderRadius: '4px',
                                overflow: 'hidden'
                            }}>
                                <button
                                    onClick={() => this.setState({ filterCompletion: 'all' }, () => this.saveFilterSettings())}
                                    style={{
                                        flex: 1,
                                        padding: '8px 16px',
                                        fontSize: '14px',
                                        fontWeight: 500,
                                        backgroundColor: filterCompletion === 'all' ? buttonBg : subtleBackground,
                                        color: filterCompletion === 'all' ? buttonColor : centerChannelColor,
                                        border: 'none',
                                        borderRight: `1px solid ${borderColor}`,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        userSelect: 'none'
                                    }}
                                >
                                    All
                                </button>
                                <button
                                    onClick={() => this.setState({ filterCompletion: 'complete' }, () => this.saveFilterSettings())}
                                    style={{
                                        flex: 1,
                                        padding: '8px 16px',
                                        fontSize: '14px',
                                        fontWeight: 500,
                                        backgroundColor: filterCompletion === 'complete' ? buttonBg : subtleBackground,
                                        color: filterCompletion === 'complete' ? buttonColor : centerChannelColor,
                                        border: 'none',
                                        borderRight: `1px solid ${borderColor}`,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        userSelect: 'none'
                                    }}
                                >
                                    Complete
                                </button>
                                <button
                                    onClick={() => this.setState({ filterCompletion: 'incomplete' }, () => this.saveFilterSettings())}
                                    style={{
                                        flex: 1,
                                        padding: '8px 16px',
                                        fontSize: '14px',
                                        fontWeight: 500,
                                        backgroundColor: filterCompletion === 'incomplete' ? buttonBg : subtleBackground,
                                        color: filterCompletion === 'incomplete' ? buttonColor : centerChannelColor,
                                        border: 'none',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        userSelect: 'none'
                                    }}
                                >
                                    Incomplete
                                </button>
                            </div>

                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gridTemplateRows: '1fr 1fr',
                                gap: '0',
                                border: `1px solid ${borderColor}`,
                                borderRadius: '4px',
                                overflow: 'hidden'
                            }}>
                                <button
                                    onClick={() => this.setState({ filterDeadline: 'all' }, () => this.saveFilterSettings())}
                                    style={{
                                        flex: 1,
                                        padding: '8px 16px',
                                        fontSize: '14px',
                                        fontWeight: 500,
                                        backgroundColor: filterDeadline === 'all' ? buttonBg : subtleBackground,
                                        color: filterDeadline === 'all' ? buttonColor : centerChannelColor,
                                        border: 'none',
                                        borderRight: `1px solid ${borderColor}`,
                                        borderBottom: `1px solid ${borderColor}`,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        userSelect: 'none'
                                    }}
                                >
                                    All
                                </button>
                                <button
                                    onClick={() => this.setState({ filterDeadline: 'today' }, () => this.saveFilterSettings())}
                                    style={{
                                        flex: 1,
                                        padding: '8px 16px',
                                        fontSize: '14px',
                                        fontWeight: 500,
                                        backgroundColor: filterDeadline === 'today' ? buttonBg : subtleBackground,
                                        color: filterDeadline === 'today' ? buttonColor : centerChannelColor,
                                        border: 'none',
                                        borderBottom: `1px solid ${borderColor}`,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        userSelect: 'none'
                                    }}
                                >
                                    Due Today
                                </button>
                                <button
                                    onClick={() => this.setState({ filterDeadline: 'one-week' }, () => this.saveFilterSettings())}
                                    style={{
                                        flex: 1,
                                        padding: '8px 16px',
                                        fontSize: '14px',
                                        fontWeight: 500,
                                        backgroundColor: filterDeadline === 'one-week' ? buttonBg : subtleBackground,
                                        color: filterDeadline === 'one-week' ? buttonColor : centerChannelColor,
                                        border: 'none',
                                        borderRight: `1px solid ${borderColor}`,
                                        borderBottom: `1px solid ${borderColor}`,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        userSelect: 'none'
                                    }}
                                >
                                    Due Within 1 Week
                                </button>
                                <button
                                    onClick={() => this.setState({ filterDeadline: 'overdue' }, () => this.saveFilterSettings())}
                                    style={{
                                        flex: 1,
                                        padding: '8px 16px',
                                        fontSize: '14px',
                                        fontWeight: 500,
                                        backgroundColor: filterDeadline === 'overdue' ? buttonBg : subtleBackground,
                                        color: filterDeadline === 'overdue' ? buttonColor : centerChannelColor,
                                        border: 'none',
                                        borderBottom: `1px solid ${borderColor}`,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        userSelect: 'none'
                                    }}
                                >
                                    Past Due
                                </button>
                                <button
                                    onClick={() => this.setState({ filterDeadline: 'custom' }, () => this.saveFilterSettings())}
                                    style={{
                                        flex: 1,
                                        padding: '8px 16px',
                                        fontSize: '14px',
                                        fontWeight: 500,
                                        backgroundColor: filterDeadline === 'custom' ? buttonBg : subtleBackground,
                                        color: filterDeadline === 'custom' ? buttonColor : centerChannelColor,
                                        border: 'none',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        userSelect: 'none',
                                        gridColumn: '1 / span 2'
                                    }}
                                >
                                    Custom Deadline Range
                                </button>
                            </div>
                        </div>
                    )}

                    {filterDeadline === 'custom' && (
                        <div style={{ marginBottom: '20px', display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                            <label style={{ flex: '200px 1 0', fontWeight: 'normal' }}>
                                <span style={{ marginBottom: '4px', display: "block" }}>From:</span>
                                <input type='date'
                                       value={filterDeadlineCustomFrom}
                                       onChange={(e) => this.setState({ filterDeadlineCustomFrom: e.target.value })}
                                       placeholder="From"
                                       style={{
                                           width: '100%',
                                           padding: '10px',
                                           marginBottom: '8px',
                                           border: `1px solid ${borderColor}`,
                                           borderRadius: '4px',
                                           fontSize: '14px',
                                           backgroundColor: centerChannelBg,
                                           color: centerChannelColor
                                       }}></input>
                            </label>
                            <label style={{ flex: '200px 1 0', fontWeight: 'normal' }}>
                                <span style={{ marginBottom: '4px', display: "block" }}>To:</span>
                                <input type='date'
                                       value={filterDeadlineCustomTo}
                                       onChange={(e) => this.setState({ filterDeadlineCustomTo: e.target.value })}
                                       placeholder="To"
                                       style={{
                                           width: '100%',
                                           padding: '10px',
                                           marginBottom: '8px',
                                           border: `1px solid ${borderColor}`,
                                           borderRadius: '4px',
                                           fontSize: '14px',
                                           backgroundColor: centerChannelBg,
                                           color: centerChannelColor
                                       }}></input>
                            </label>
                        </div>
                    )}

                    {showTaskForm && (
                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ width: '100%', fontWeight: "normal" }}>
                                <span style={{ marginBottom: '4px', display: "block" }}>Task</span>
                                <input
                                    type="text"
                                    value={newTaskText}
                                    onChange={(e) => this.setState({ newTaskText: e.target.value })}
                                    onKeyPress={(e) => e.key === 'Enter' && this.addTask()}
                                    placeholder="Add new task..."
                                    style={{
                                        width: '100%',
                                        padding: '10px',
                                        marginBottom: '8px',
                                        border: `1px solid ${borderColor}`,
                                        borderRadius: '4px',
                                        fontSize: '14px',
                                        backgroundColor: centerChannelBg,
                                        color: centerChannelColor
                                    }}
                                    autoFocus
                                />
                            </label>
                            <label style={{ width: '100%', fontWeight: "normal" }}>
                                <span style={{ marginBottom: '4px', display: "block" }}>Group</span>
                                <select
                                    value={selectedGroup}
                                    onChange={(e) => this.setState({ selectedGroup: e.target.value })}
                                    style={{
                                        width: '100%',
                                        padding: '10px',
                                        marginBottom: '8px',
                                        border: `1px solid ${borderColor}`,
                                        borderRadius: '4px',
                                        fontSize: '14px',
                                        backgroundColor: centerChannelBg,
                                        color: centerChannelColor
                                    }}
                                >
                                    <option value="">No Group</option>
                                    {sortedGroups.map(group => (
                                        <option key={group.id} value={group.id}>{group.name}</option>
                                    ))}
                                </select>
                            </label>
                            <label style={{ width: '100%', fontWeight: "normal" }}>
                                <span style={{ marginBottom: '4px', display: "block" }}>Deadline</span>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type="date"
                                        value={newTaskDeadline}
                                        onChange={(e) => this.setState({ newTaskDeadline: e.target.value })}
                                        placeholder="Deadline (optional)"
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            paddingRight: newTaskDeadline ? '40px' : '10px',
                                            marginBottom: '8px',
                                            border: `1px solid ${borderColor}`,
                                            borderRadius: '4px',
                                            fontSize: '14px',
                                            backgroundColor: centerChannelBg,
                                            color: centerChannelColor
                                        }}
                                    />
                                    {newTaskDeadline && (
                                        <button
                                            onClick={() => this.setState({ newTaskDeadline: '' })}
                                            style={{
                                                position: 'absolute',
                                                right: '8px',
                                                top: '50%',
                                                transform: 'translateY(-50%)',
                                                padding: '4px 8px',
                                                fontSize: '14px',
                                                color: subtleText,
                                                backgroundColor: 'transparent',
                                                border: 'none',
                                                cursor: 'pointer',
                                                marginBottom: '8px'
                                            }}
                                            title="Clear deadline"
                                        >
                                            ×
                                        </button>
                                    )}
                                </div>
                            </label>
                            <button
                                onClick={this.addTask}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    backgroundColor: buttonBg,
                                    color: buttonColor,
                                    border: 'none',
                                    borderRadius: '4px',
                                    fontSize: '14px',
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                }}
                            >
                                Add Task
                            </button>
                        </div>
                    )}

                    {showGroupForm && (
                        <div style={{ marginBottom: '20px' }}>
                            <input
                                type="text"
                                value={newGroupName}
                                onChange={(e) => this.setState({ newGroupName: e.target.value })}
                                onKeyPress={(e) => e.key === 'Enter' && this.addGroup()}
                                placeholder="Group name..."
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    marginBottom: '8px',
                                    border: `1px solid ${borderColor}`,
                                    borderRadius: '4px',
                                    fontSize: '14px',
                                    backgroundColor: centerChannelBg,
                                    color: centerChannelColor
                                }}
                                autoFocus
                            />
                            <button
                                onClick={this.addGroup}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    backgroundColor: onlineIndicator,
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '4px',
                                    fontSize: '14px',
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                }}
                            >
                                Create Group
                            </button>
                        </div>
                    )}

                    {sortedGroups.map(group => (
                        <TaskGroupSection
                            key={group.id}
                            title={group.name}
                            groupId={group.id}
                            group={group}
                            tasks={this.groupedTasks(group.id)}
                            channelMembers={channelMembers}
                            onToggle={this.toggleTask}
                            onDelete={this.deleteTask}
                            onToggleAssignee={this.toggleAssignee}
                            onUpdateText={this.updateTaskText}
                            onDeleteGroup={() => this.confirmDeleteGroup(group.id)}
                            onUpdateGroupName={this.updateGroupName}
                            onDragStart={this.handleDragStart}
                            onDragEnd={this.handleDragEnd}
                            onDrop={this.handleDrop}
                            onDragOverTask={this.handleDragOverTask}
                            onDragLeaveTask={this.handleDragLeaveTask}
                            onDropOnTask={this.handleDropOnTask}
                            isDragging={!!draggedTask}
                            dragOverTaskId={dragOverTaskId}
                            dragOverPosition={dragOverPosition}
                            onDragStartGroup={this.handleDragStartGroup}
                            onDragEndGroup={this.handleDragEndGroup}
                            onDragOverGroup={this.handleDragOverGroup}
                            onDragLeaveGroup={this.handleDragLeaveGroup}
                            onDropOnGroup={this.handleDropOnGroup}
                            isDraggingGroup={!!draggedGroup}
                            isDropTargetGroup={dragOverGroupId === group.id}
                            dropPositionGroup={dragOverGroupId === group.id ? dragOverGroupPosition : null}
                            theme={theme}
                        />
                    ))}

                    <TaskGroupSection
                        title="Ungrouped"
                        groupId={null}
                        group={null}
                        tasks={this.groupedTasks(null)}
                        channelMembers={channelMembers}
                        onToggle={this.toggleTask}
                        onDelete={this.deleteTask}
                        onToggleAssignee={this.toggleAssignee}
                        onUpdateText={this.updateTaskText}
                        onDragStart={this.handleDragStart}
                        onDragEnd={this.handleDragEnd}
                        onDrop={this.handleDrop}
                        onDragOverTask={this.handleDragOverTask}
                        onDragLeaveTask={this.handleDragLeaveTask}
                        onDropOnTask={this.handleDropOnTask}
                        isDragging={!!draggedTask}
                        dragOverTaskId={dragOverTaskId}
                        dragOverPosition={dragOverPosition}
                        onDragStartGroup={this.handleDragStartGroup}
                        onDragEndGroup={this.handleDragEndGroup}
                        onDragOverGroup={this.handleDragOverGroup}
                        onDragLeaveGroup={this.handleDragLeaveGroup}
                        onDropOnGroup={this.handleDropOnGroup}
                        isDraggingGroup={!!draggedGroup}
                        isDropTargetGroup={false}
                        dropPositionGroup={null}
                        theme={theme}
                    />

                    {this.state.tasks.length === 0 && (
                        <div style={{
                            textAlign: 'center',
                            padding: '40px 20px',
                            color: subtleText
                        }}>
                            No tasks yet. Add one above to get started!
                        </div>
                    )}

                    {this.state.tasks.length > 0 && sortedGroups.every(g => this.groupedTasks(g.id).length === 0) && this.groupedTasks(null).length === 0 && (
                        <div style={{
                            textAlign: 'center',
                            padding: '40px 20px',
                            color: subtleText
                        }}>
                            No tasks match the current filters.
                        </div>
                    )}
                </div>

                {deleteGroupWarningShown && groupToDelete && (
                    <DeleteGroupWarning
                        groupName={groupToDelete.name}
                        taskCount={groupToDelete.taskCount}
                        onConfirm={this.deleteGroupWithPreference}
                        onCancel={this.cancelDeleteGroup}
                        theme={theme}
                    />
                )}
            </div>
        );
    }
}
