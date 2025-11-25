import React from 'react';

// Types
interface TaskItem {
    id: string;
    text: string;
    completed: boolean;
    assignee_ids?: string[];
    group_id?: string;
    created_at: string;
    completed_at?: string;
    deadline?: string;
}

interface TaskGroup {
    id: string;
    name: string;
    order?: string;
}

interface ChannelTaskList {
    items: TaskItem[];
    groups: TaskGroup[];
}

// Main Plugin Class
export default class Plugin {
    private store: any = null;
    private toggleRHSPlugin: any = null;
    private channelChangeCallbacks: Array<() => void> = [];

    public initialize(registry: any, store: any) {
        this.store = store;

        // Create a title component that updates when channel changes
        const DynamicTitle = () => {
            const [title, setTitle] = React.useState('Channel Tasks');

            React.useEffect(() => {
                let lastChannelId: string | null = null;

                const updateTitle = () => {
                    const state = store.getState();
                    const currentChannelId = state?.entities?.channels?.currentChannelId;

                    if (currentChannelId && currentChannelId !== lastChannelId) {
                        lastChannelId = currentChannelId;
                        const channels = state?.entities?.channels?.channels;

                        if (channels && channels[currentChannelId]) {
                            const channel = channels[currentChannelId];
                            setTitle(`${channel.display_name || channel.name} Tasks`);
                        }

                        // Notify all registered callbacks that channel changed
                        this.channelChangeCallbacks.forEach(callback => callback());
                    }
                };

                // Initial update
                updateTitle();

                // Subscribe to store changes
                const unsubscribe = store.subscribe(updateTitle);
                return () => unsubscribe();
            }, []);

            return <span>{title}</span>;
        };

        // Wrapper component to provide channel change callback
        const TaskSidebarWrapper = (props: any) => {
            const onChannelChange = (callback: () => void) => {
                this.channelChangeCallbacks.push(callback);
            };

            return <TaskSidebar {...props} onChannelChange={onChannelChange} />;
        };

        const {toggleRHSPlugin} = registry.registerRightHandSidebarComponent(
            TaskSidebarWrapper,
            DynamicTitle
        );

        this.toggleRHSPlugin = toggleRHSPlugin;

        registry.registerChannelHeaderButtonAction(
            () => <i className="icon icon-check" style={{ fontSize: '18px' }} />,
            () => {
                store.dispatch(toggleRHSPlugin);
            },
            'Task List',
            'Open task list for this channel'
        );

        registry.registerChannelHeaderMenuAction(
            'Task List',
            () => {
                store.dispatch(toggleRHSPlugin);
            },
            () => <i className="icon icon-check" />
        );
    }

    public uninitialize() {
        // Cleanup
    }
}

// Sidebar Component (for RHS)
class TaskSidebar extends React.Component<any> {
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

    adjustOpacity = (foreground: string, background: string, opacity: number) => {
        const hex2rgb = (hex: string) => {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : { r: 255, g: 255, b: 255 };
        };

        const fg = hex2rgb(foreground);
        const bg = hex2rgb(background);

        const r = Math.round(fg.r * opacity + bg.r * (1 - opacity));
        const g = Math.round(fg.g * opacity + bg.g * (1 - opacity));
        const b = Math.round(fg.b * opacity + bg.b * (1 - opacity));

        return `rgb(${r}, ${g}, ${b})`;
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
        const errorTextColor = theme.errorTextColor || '#dc3545';

        const subtleBackground = this.adjustOpacity(centerChannelColor, centerChannelBg, 0.05);
        const borderColor = this.adjustOpacity(centerChannelColor, centerChannelBg, 0.1);
        const subtleText = this.adjustOpacity(centerChannelColor, centerChannelBg, 0.6);

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

// Delete Group Warning Component
const DeleteGroupWarning: React.FC<{
    groupName: string;
    taskCount: number;
    onConfirm: (dontWarnAgain: boolean) => void;
    onCancel: () => void;
    theme: any;
}> = ({ groupName, taskCount, onConfirm, onCancel, theme }) => {
    const [dontWarnAgain, setDontWarnAgain] = React.useState(false);

    const centerChannelBg = theme?.centerChannelBg || '#ffffff';
    const centerChannelColor = theme?.centerChannelColor || '#333333';
    const buttonBg = theme?.buttonBg || '#1c58d9';
    const buttonColor = theme?.buttonColor || '#ffffff';
    const errorTextColor = theme?.errorTextColor || '#dc3545';

    const adjustOpacity = (foreground: string, background: string, opacity: number) => {
        const hex2rgb = (hex: string) => {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : { r: 255, g: 255, b: 255 };
        };

        const fg = hex2rgb(foreground);
        const bg = hex2rgb(background);

        const r = Math.round(fg.r * opacity + bg.r * (1 - opacity));
        const g = Math.round(fg.g * opacity + bg.g * (1 - opacity));
        const b = Math.round(fg.b * opacity + bg.b * (1 - opacity));

        return `rgb(${r}, ${g}, ${b})`;
    };

    const borderColor = adjustOpacity(centerChannelColor, centerChannelBg, 0.15);
    const subtleBackground = adjustOpacity(centerChannelColor, centerChannelBg, 0.05);

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000
        }}>
            <div style={{
                backgroundColor: centerChannelBg,
                borderRadius: '8px',
                padding: '24px',
                maxWidth: '400px',
                width: '90%',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
                border: `1px solid ${borderColor}`
            }}>
                <h3 style={{
                    margin: '0 0 16px 0',
                    fontSize: '18px',
                    fontWeight: 600,
                    color: errorTextColor
                }}>
                    Delete Group "{groupName}"?
                </h3>
                <p style={{
                    margin: '0 0 20px 0',
                    fontSize: '14px',
                    lineHeight: '1.5',
                    color: centerChannelColor
                }}>
                    This will permanently delete the group and all <strong>{taskCount}</strong> task{taskCount !== 1 ? 's' : ''} in it. This action cannot be undone.
                </p>
                <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    marginBottom: '20px',
                    fontSize: '14px',
                    color: centerChannelColor,
                    cursor: 'pointer',
                    userSelect: 'none'
                }}>
                    <input
                        type="checkbox"
                        checked={dontWarnAgain}
                        onChange={(e) => setDontWarnAgain(e.target.checked)}
                        style={{
                            marginRight: '8px',
                            cursor: 'pointer'
                        }}
                    />
                    Don't warn me again
                </label>
                <div style={{
                    display: 'flex',
                    gap: '12px',
                    justifyContent: 'flex-end'
                }}>
                    <button
                        onClick={onCancel}
                        style={{
                            padding: '10px 20px',
                            fontSize: '14px',
                            fontWeight: 500,
                            backgroundColor: subtleBackground,
                            color: centerChannelColor,
                            border: `1px solid ${borderColor}`,
                            borderRadius: '4px',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onConfirm(dontWarnAgain)}
                        style={{
                            padding: '10px 20px',
                            fontSize: '14px',
                            fontWeight: 500,
                            backgroundColor: errorTextColor,
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        Delete Group & Tasks
                    </button>
                </div>
            </div>
        </div>
    );
};

// Task Group Section Component
const TaskGroupSection: React.FC<{
    title: string;
    groupId: string | null;
    group: TaskGroup | null;
    tasks: TaskItem[];
    channelMembers: any[];
    onToggle: (task: TaskItem) => void;
    onDelete: (taskId: string) => void;
    onToggleAssignee: (task: TaskItem, userId: string) => void;
    onUpdateText: (task: TaskItem, newText: string) => void;
    onDeleteGroup?: () => void;
    onUpdateGroupName?: (group: TaskGroup, newName: string) => void;
    onDragStart: (task: TaskItem) => void;
    onDragEnd: () => void;
    onDrop: (groupId: string | null) => void;
    onDragOverTask: (taskId: string, position: 'before' | 'after') => void;
    onDragLeaveTask: () => void;
    onDropOnTask: (task: TaskItem, position: 'before' | 'after') => void;
    isDragging: boolean;
    dragOverTaskId: string | null;
    dragOverPosition: 'before' | 'after' | null;
    onDragStartGroup: (group: TaskGroup) => void;
    onDragEndGroup: () => void;
    onDragOverGroup: (groupId: string, position: 'before' | 'after') => void;
    onDragLeaveGroup: () => void;
    onDropOnGroup: (group: TaskGroup, position: 'before' | 'after') => void;
    isDraggingGroup: boolean;
    isDropTargetGroup: boolean;
    dropPositionGroup: 'before' | 'after' | null;
    theme: any;
}> = ({ title, groupId, group, tasks, channelMembers, onToggle, onDelete, onToggleAssignee, onUpdateText, onDeleteGroup, onUpdateGroupName, onDragStart, onDragEnd, onDrop, onDragOverTask, onDragLeaveTask, onDropOnTask, isDragging, dragOverTaskId, dragOverPosition, onDragStartGroup, onDragEndGroup, onDragOverGroup, onDragLeaveGroup, onDropOnGroup, isDraggingGroup, isDropTargetGroup, dropPositionGroup, theme }) => {
    const [isDragOver, setIsDragOver] = React.useState(false);
    const [isDraggingThis, setIsDraggingThis] = React.useState(false);
    const [isEditingName, setIsEditingName] = React.useState(false);
    const [editName, setEditName] = React.useState(title);
    const nameInputRef = React.useRef<HTMLInputElement>(null);

    const centerChannelBg = theme?.centerChannelBg || '#ffffff';
    const centerChannelColor = theme?.centerChannelColor || '#333333';
    const buttonBg = theme?.buttonBg || '#1c58d9';
    const errorTextColor = theme?.errorTextColor || '#dc3545';

    const adjustOpacity = (foreground: string, background: string, opacity: number) => {
        const hex2rgb = (hex: string) => {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : { r: 255, g: 255, b: 255 };
        };

        const fg = hex2rgb(foreground);
        const bg = hex2rgb(background);

        const r = Math.round(fg.r * opacity + bg.r * (1 - opacity));
        const g = Math.round(fg.g * opacity + bg.g * (1 - opacity));
        const b = Math.round(fg.b * opacity + bg.b * (1 - opacity));

        return `rgb(${r}, ${g}, ${b})`;
    };

    const borderColor = adjustOpacity(centerChannelColor, centerChannelBg, 0.1);
    const subtleText = adjustOpacity(centerChannelColor, centerChannelBg, 0.6);
    const dropZoneBg = adjustOpacity(buttonBg, centerChannelBg, 0.1);
    const dragHandleColor = adjustOpacity(centerChannelColor, centerChannelBg, 0.4);

    React.useEffect(() => {
        if (!isDragging) {
            setIsDragOver(false);
        }
    }, [isDragging]);

    React.useEffect(() => {
        if (isEditingName && nameInputRef.current) {
            nameInputRef.current.focus();
            nameInputRef.current.select();
        }
    }, [isEditingName]);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setIsDragOver(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        const target = e.currentTarget as HTMLElement;
        const relatedTarget = e.relatedTarget as HTMLElement;

        if (!relatedTarget || !target.contains(relatedTarget)) {
            setIsDragOver(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        onDrop(groupId);
    };

    const handleGroupDragStart = (e: React.DragEvent) => {
        if (!group) return;
        setIsDraggingThis(true);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', group.id);
        onDragStartGroup(group);
    };

    const handleGroupDragEnd = (e: React.DragEvent) => {
        setIsDraggingThis(false);
        onDragEndGroup();
    };

    const handleGroupDragOver = (e: React.DragEvent) => {
        if (!group || !isDraggingGroup) {
            e.stopPropagation();
            return;
        }
        e.preventDefault();
        e.stopPropagation();

        const rect = e.currentTarget.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        const mouseY = e.clientY;

        const position = mouseY < midpoint ? 'before' : 'after';
        onDragOverGroup(group.id, position);
    };

    const handleGroupDragLeave = (e: React.DragEvent) => {
        if (!isDraggingGroup) return;
        const target = e.currentTarget as HTMLElement;
        const relatedTarget = e.relatedTarget as HTMLElement;

        if (!relatedTarget || !target.contains(relatedTarget)) {
            onDragLeaveGroup();
        }
    };

    const handleGroupDrop = (e: React.DragEvent) => {
        if (!group || !isDraggingGroup) return;
        e.preventDefault();
        e.stopPropagation();

        if (!dropPositionGroup) return;
        onDropOnGroup(group, dropPositionGroup);
    };

    const handleNameClick = () => {
        if (group && onUpdateGroupName) {
            setIsEditingName(true);
            setEditName(title);
        }
    };

    const handleSaveNameEdit = () => {
        if (group && onUpdateGroupName && editName.trim() && editName !== title) {
            onUpdateGroupName(group, editName.trim());
        }
        setIsEditingName(false);
    };

    const handleCancelNameEdit = () => {
        setEditName(title);
        setIsEditingName(false);
    };

    const handleNameKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSaveNameEdit();
        } else if (e.key === 'Escape') {
            handleCancelNameEdit();
        }
    };

    const isUngrouped = groupId === null;
    const hasContent = tasks.length > 0;
    const isCreatedGroup = onDeleteGroup !== undefined;
    const isFiltered = !hasContent && isCreatedGroup;

    const shouldShow = isCreatedGroup || hasContent || (isDragging && !isUngrouped) || (isDragging && isUngrouped);

    if (isUngrouped && !hasContent && !isDragging) {
        return null;
    }

    if (!shouldShow) return null;

    const showDropZone = isDragging && tasks.length === 0;
    const dropIndicatorColor = buttonBg;
    const groupOpacity = isFiltered ? 0.5 : 1;

    if (!hasContent && !showDropZone) {
        return (
            <div style={{ position: 'relative' }}>
                {isDraggingGroup && isDropTargetGroup && dropPositionGroup === 'before' && (
                    <div style={{
                        position: 'absolute',
                        top: '-4px',
                        left: '0',
                        right: '0',
                        height: '3px',
                        backgroundColor: dropIndicatorColor,
                        borderRadius: '2px',
                        zIndex: 10,
                        boxShadow: `0 0 4px -2px ${dropIndicatorColor}`
                    }} />
                )}
                <div
                    draggable={!!group}
                    onDragStart={handleGroupDragStart}
                    onDragEnd={handleGroupDragEnd}
                    onDragOver={handleGroupDragOver}
                    onDragLeave={handleGroupDragLeave}
                    onDrop={handleGroupDrop}
                    style={{
                        marginBottom: '0px',
                        minHeight: '60px',
                        borderRadius: '8px',
                        padding: '8px',
                        paddingBottom: '4px',
                        border: isDraggingThis ? `2px dashed ${buttonBg}` : '2px solid transparent',
                        opacity: isDraggingThis ? 0.4 : groupOpacity,
                        position: 'relative',
                        transition: 'all 0.2s ease',
                        cursor: group ? 'grab' : 'default'
                    }}
                >
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                            {isEditingName ? (
                                <input
                                    ref={nameInputRef}
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    onKeyDown={handleNameKeyDown}
                                    onBlur={handleSaveNameEdit}
                                    style={{
                                        padding: '4px 8px',
                                        fontSize: '13px',
                                        fontWeight: 600,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px',
                                        border: `2px solid ${buttonBg}`,
                                        borderRadius: '3px',
                                        backgroundColor: centerChannelBg,
                                        color: centerChannelColor,
                                        outline: 'none'
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            ) : (
                                <h4
                                    onClick={handleNameClick}
                                    style={{
                                        margin: 0,
                                        fontSize: '13px',
                                        fontWeight: 600,
                                        textTransform: 'uppercase',
                                        color: subtleText,
                                        letterSpacing: '0.5px',
                                        cursor: (group && onUpdateGroupName) ? 'text' : 'default',
                                        padding: '4px 8px',
                                        borderRadius: '3px',
                                        transition: 'background-color 0.2s'
                                    }}
                                    onMouseEnter={(e) => {
                                        if (group && onUpdateGroupName) {
                                            e.currentTarget.style.backgroundColor = adjustOpacity(centerChannelColor, centerChannelBg, 0.05);
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = 'transparent';
                                    }}
                                    title={(group && onUpdateGroupName) ? 'Click to edit' : ''}
                                >
                                    {title}
                                </h4>
                            )}
                        </div>
                        {onDeleteGroup && (
                            <button
                                onClick={onDeleteGroup}
                                style={{
                                    padding: '4px',
                                    fontSize: '20px',
                                    lineHeight: '18px',
                                    color: errorTextColor,
                                    backgroundColor: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer'
                                }}
                                title="Delete group"
                            >
                                ×
                            </button>
                        )}
                    </div>
                </div>
                {isDraggingGroup && isDropTargetGroup && dropPositionGroup === 'after' && (
                    <div style={{
                        position: 'absolute',
                        bottom: '4px',
                        left: '0',
                        right: '0',
                        height: '3px',
                        backgroundColor: dropIndicatorColor,
                        borderRadius: '2px',
                        zIndex: 10,
                        boxShadow: `0 0 4px -2px ${dropIndicatorColor}`
                    }} />
                )}
            </div>
        );
    }

    return (
        <div style={{ position: 'relative' }}>
            {isDraggingGroup && isDropTargetGroup && dropPositionGroup === 'before' && (
                <div style={{
                    position: 'absolute',
                    top: '-4px',
                    left: '0',
                    right: '0',
                    height: '3px',
                    backgroundColor: dropIndicatorColor,
                    borderRadius: '2px',
                    zIndex: 10,
                    boxShadow: `0 0 4px -2px ${dropIndicatorColor}`
                }} />
            )}
            <div
                draggable={!!group}
                onDragStart={handleGroupDragStart}
                onDragEnd={handleGroupDragEnd}
                onDragOver={(e) => {
                    handleDragOver(e);
                    handleGroupDragOver(e);
                }}
                onDragLeave={(e) => {
                    handleDragLeave(e);
                    handleGroupDragLeave(e);
                }}
                onDrop={(e) => {
                    handleDrop(e);
                    handleGroupDrop(e);
                }}
                style={{
                    marginBottom: '0px',
                    minHeight: showDropZone ? '80px' : 'auto',
                    backgroundColor: isDragOver ? dropZoneBg : (showDropZone ? adjustOpacity(centerChannelColor, centerChannelBg, 0.02) : 'transparent'),
                    border: isDraggingThis ? `2px dashed ${buttonBg}` : (isDragOver ? `2px dashed ${buttonBg}` : (showDropZone ? `2px dashed ${borderColor}` : 'none')),
                    borderRadius: '8px',
                    padding: '8px',
                    paddingBottom: '4px',
                    transition: 'all 0.2s ease',
                    position: 'relative',
                    opacity: isDraggingThis ? 0.4 : groupOpacity,
                    cursor: group ? 'grab' : 'default'
                }}
            >
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: tasks.length > 0 ? '4px' : '0'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                        {isEditingName ? (
                            <input
                                ref={nameInputRef}
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                onKeyDown={handleNameKeyDown}
                                onBlur={handleSaveNameEdit}
                                style={{
                                    padding: '4px 8px',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px',
                                    border: `2px solid ${buttonBg}`,
                                    borderRadius: '3px',
                                    backgroundColor: centerChannelBg,
                                    color: centerChannelColor,
                                    outline: 'none'
                                }}
                                onClick={(e) => e.stopPropagation()}
                            />
                        ) : (
                            <h4
                                onClick={handleNameClick}
                                style={{
                                    margin: 0,
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    color: subtleText,
                                    letterSpacing: '0.5px',
                                    cursor: (group && onUpdateGroupName) ? 'text' : 'default',
                                    padding: '4px 8px',
                                    borderRadius: '3px',
                                    transition: 'background-color 0.2s'
                                }}
                                onMouseEnter={(e) => {
                                    if (group && onUpdateGroupName) {
                                        e.currentTarget.style.backgroundColor = adjustOpacity(centerChannelColor, centerChannelBg, 0.05);
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                }}
                                title={(group && onUpdateGroupName) ? 'Click to edit' : ''}
                            >
                                {title}
                            </h4>
                        )}
                    </div>
                    {onDeleteGroup && (
                        <button
                            onClick={onDeleteGroup}
                            style={{
                                padding: '4px',
                                fontSize: '20px',
                                lineHeight: '18px',
                                color: errorTextColor,
                                backgroundColor: 'transparent',
                                border: 'none',
                                cursor: 'pointer'
                            }}
                            title="Delete group"
                        >
                            ×
                        </button>
                    )}
                </div>

                {showDropZone && (
                    <div style={{
                        padding: '24px',
                        textAlign: 'center',
                        color: isDragOver ? buttonBg : subtleText,
                        fontSize: '13px',
                        fontStyle: 'italic',
                        fontWeight: isDragOver ? 600 : 400
                    }}>
                        {isDragOver ? `Drop to move to ${title}` : `Drag items here to move to ${title}`}
                    </div>
                )}

                {tasks.map(task => (
                    <TaskItemComponent
                        key={task.id}
                        task={task}
                        channelMembers={channelMembers}
                        onToggle={onToggle}
                        onDelete={onDelete}
                        onToggleAssignee={onToggleAssignee}
                        onUpdateText={onUpdateText}
                        onDragStart={onDragStart}
                        onDragEnd={onDragEnd}
                        onDragOverTask={onDragOverTask}
                        onDragLeaveTask={onDragLeaveTask}
                        onDropOnTask={onDropOnTask}
                        isDraggingItem={isDragging}
                        isDropTarget={dragOverTaskId === task.id}
                        dropPosition={dragOverTaskId === task.id ? dragOverPosition : null}
                        theme={theme}
                    />
                ))}
            </div>
            {isDraggingGroup && isDropTargetGroup && dropPositionGroup === 'after' && (
                <div style={{
                    position: 'absolute',
                    bottom: '-4px',
                    left: '0',
                    right: '0',
                    height: '3px',
                    backgroundColor: dropIndicatorColor,
                    borderRadius: '2px',
                    zIndex: 10,
                    boxShadow: `0 0 4px -2px ${dropIndicatorColor}`
                }} />
            )}
        </div>
    );
};

// Individual Task Item Component
const TaskItemComponent: React.FC<{
    task: TaskItem;
    channelMembers: any[];
    onToggle: (task: TaskItem) => void;
    onDelete: (taskId: string) => void;
    onToggleAssignee: (task: TaskItem, userId: string) => void;
    onUpdateText: (task: TaskItem, newText: string) => void;
    onDragStart: (task: TaskItem) => void;
    onDragEnd: () => void;
    onDragOverTask: (taskId: string, position: 'before' | 'after') => void;
    onDragLeaveTask: () => void;
    onDropOnTask: (task: TaskItem, position: 'before' | 'after') => void;
    isDraggingItem: boolean;
    isDropTarget: boolean;
    dropPosition: 'before' | 'after' | null;
    theme: any;
}> = ({ task, channelMembers, onToggle, onDelete, onToggleAssignee, onUpdateText, onDragStart, onDragEnd, onDragOverTask, onDragLeaveTask, onDropOnTask, isDraggingItem, isDropTarget, dropPosition, theme }) => {
    const [isDragging, setIsDragging] = React.useState(false);
    const [showAssigneePopup, setShowAssigneePopup] = React.useState(false);
    const [isEditing, setIsEditing] = React.useState(false);
    const [editText, setEditText] = React.useState(task.text);
    const [isEditingDeadline, setIsEditingDeadline] = React.useState(false);
    const [editDeadline, setEditDeadline] = React.useState(task.deadline ? new Date(task.deadline).toISOString().split('T')[0] : '');
    const popupRef = React.useRef<HTMLDivElement>(null);
    const inputRef = React.useRef<HTMLInputElement>(null);
    const deadlineInputRef = React.useRef<HTMLInputElement>(null);

    // Update editDeadline when task.deadline changes
    React.useEffect(() => {
        setEditDeadline(task.deadline ? new Date(task.deadline).toISOString().split('T')[0] : '');
    }, [task.deadline]);

    const centerChannelBg = theme?.centerChannelBg || '#ffffff';
    const centerChannelColor = theme?.centerChannelColor || '#333333';
    const buttonBg = theme?.buttonBg || '#1c58d9';
    const errorTextColor = theme?.errorTextColor || '#dc3545';

    const adjustOpacity = (foreground: string, background: string, opacity: number) => {
        const hex2rgb = (hex: string) => {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : { r: 255, g: 255, b: 255 };
        };

        const fg = hex2rgb(foreground);
        const bg = hex2rgb(background);

        const r = Math.round(fg.r * opacity + bg.r * (1 - opacity));
        const g = Math.round(fg.g * opacity + bg.g * (1 - opacity));
        const b = Math.round(fg.b * opacity + bg.b * (1 - opacity));

        return `rgb(${r}, ${g}, ${b})`;
    };

    const borderColor = adjustOpacity(centerChannelColor, centerChannelBg, 0.1);
    const completedBg = adjustOpacity(centerChannelColor, centerChannelBg, 0.05);
    const completedText = adjustOpacity(centerChannelColor, centerChannelBg, 0.5);
    const dragHandleColor = adjustOpacity(centerChannelColor, centerChannelBg, 0.4);
    const hoverBg = adjustOpacity(centerChannelColor, centerChannelBg, 0.05);
    const assigneeBg = adjustOpacity(centerChannelColor, centerChannelBg, 0.08);
    const popupBorder = adjustOpacity(centerChannelColor, centerChannelBg, 0.15);
    const selectedBg = adjustOpacity(buttonBg, centerChannelBg, 0.1);

    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
                setShowAssigneePopup(false);
            }
        };

        if (showAssigneePopup) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [showAssigneePopup]);

    React.useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    React.useEffect(() => {
        if (isEditingDeadline && deadlineInputRef.current) {
            deadlineInputRef.current.focus();
        }
    }, [isEditingDeadline]);

    const handleDragStart = (e: React.DragEvent) => {
        e.stopPropagation(); // Prevent group drag from triggering
        setIsDragging(true);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', task.id);
        e.dataTransfer.dropEffect = 'move';
        onDragStart(task);
    };

    const handleDragEnd = (e: React.DragEvent) => {
        e.stopPropagation(); // Prevent group drag end from triggering
        setIsDragging(false);
        onDragEnd();
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'BUTTON') {
            return;
        }
    };

    const handleItemDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!isDraggingItem) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        const mouseY = e.clientY;

        const position = mouseY < midpoint ? 'before' : 'after';
        onDragOverTask(task.id, position);
    };

    const handleItemDragLeave = (e: React.DragEvent) => {
        const target = e.currentTarget as HTMLElement;
        const relatedTarget = e.relatedTarget as HTMLElement;

        if (!relatedTarget || !target.contains(relatedTarget)) {
            onDragLeaveTask();
        }
    };

    const handleItemDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!dropPosition) return;

        onDropOnTask(task, dropPosition);
    };

    const handleTextClick = () => {
        if (!task.completed) {
            setIsEditing(true);
            setEditText(task.text);
        }
    };

    const handleSaveEdit = () => {
        if (editText.trim() && editText !== task.text) {
            onUpdateText(task, editText.trim());
        }
        setIsEditing(false);
    };

    const handleCancelEdit = () => {
        setEditText(task.text);
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSaveEdit();
        } else if (e.key === 'Escape') {
            handleCancelEdit();
        }
    };

    const handleDeadlineClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        // If there's no current deadline, set default to today
        if (!editDeadline) {
            const today = new Date().toISOString().split('T')[0];
            setEditDeadline(today);
        }
        setIsEditingDeadline(true);
    };

    const handleSaveDeadlineEdit = async () => {
        // Check if deadline actually changed
        const currentDeadline = task.deadline ? new Date(task.deadline).toISOString().split('T')[0] : '';
        if (editDeadline === currentDeadline) {
            setIsEditingDeadline(false);
            return;
        }

        const channelId = (window as any).store?.getState()?.entities?.channels?.currentChannelId;
        if (!channelId) {
            setIsEditingDeadline(false);
            return;
        }

        try {
            const updatedTask = {
                ...task,
                deadline: editDeadline ? new Date(editDeadline).toISOString() : undefined
            };

            const response = await fetch(`/plugins/com.mattermost.channel-task/api/v1/tasks?channel_id=${channelId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedTask)
            });

            if (response.ok) {
                // Update the task prop immediately (optimistic update)
                task.deadline = editDeadline ? new Date(editDeadline).toISOString() : undefined;
                setIsEditingDeadline(false);
                // Trigger parent reload
                onUpdateText(task, task.text);
            } else {
                setIsEditingDeadline(false);
            }
        } catch (error) {
            console.error('Error updating deadline:', error);
            setIsEditingDeadline(false);
        }
    };

    const handleCancelDeadlineEdit = () => {
        setEditDeadline(task.deadline ? new Date(task.deadline).toISOString().split('T')[0] : '');
        setIsEditingDeadline(false);
    };

    const handleDeadlineKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSaveDeadlineEdit();
        } else if (e.key === 'Escape') {
            handleCancelDeadlineEdit();
        }
    };

    const assigneeIds = task.assignee_ids || [];
    const assignedMembers = channelMembers.filter(m => assigneeIds.includes(m.id));

    const dropIndicatorColor = buttonBg;

    // Calculate deadline color
    const getDeadlineColor = () => {
        if (task.completed) return '#28a745'; // Green for completed

        if (!task.deadline) return null;

        const deadline = new Date(task.deadline);
        // Check if deadline is invalid or zero date
        if (isNaN(deadline.getTime()) || deadline.getFullYear() < 1970) return null;

        const now = new Date();
        now.setHours(0, 0, 0, 0); // Reset to start of day for accurate comparison
        const deadlineDate = new Date(deadline);
        deadlineDate.setHours(0, 0, 0, 0);

        const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        if (deadlineDate < now) {
            return '#dc3545'; // Red for past due (before today)
        } else if (deadlineDate <= oneWeekFromNow) {
            return '#fd7e14'; // Orange for today or within a week
        }
        return null;
    };

    const deadlineColor = getDeadlineColor();

    // Check if deadline is valid
    const hasValidDeadline = task.deadline && (() => {
        const deadline = new Date(task.deadline);
        return !isNaN(deadline.getTime()) && deadline.getFullYear() >= 1970;
    })();

    // Format deadline for display
    const formatDeadline = (deadlineStr: string) => {
        const deadline = new Date(deadlineStr);
        const now = new Date();
        const diffTime = deadline.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        const dateStr = deadline.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: deadline.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        });

        if (diffDays < 0) {
            return `${dateStr}`;
        } else if (diffDays === 0) {
            return `Today`;
        } else if (diffDays === 1) {
            return `Tomorrow`;
        } else if (diffDays <= 7) {
            return `${dateStr} (${diffDays} days)`;
        }
        return dateStr;
    };

    return (
        <div style={{ position: 'relative' }}>
            {isDropTarget && dropPosition === 'before' && (
                <div style={{
                    position: 'absolute',
                    top: '-4px',
                    left: '0',
                    right: '0',
                    height: '3px',
                    backgroundColor: dropIndicatorColor,
                    borderRadius: '2px',
                    zIndex: 10,
                    boxShadow: `0 0 4px -2px ${dropIndicatorColor}`
                }} />
            )}

            <div
                draggable="true"
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onMouseDown={handleMouseDown}
                onDragOver={handleItemDragOver}
                onDragLeave={handleItemDragLeave}
                onDrop={handleItemDrop}
                onClick={(e) => {
                    // Toggle completion when clicking on the background
                    const target = e.target as HTMLElement;
                    if (target === e.currentTarget || target.hasAttribute('data-task-background')) {
                        onToggle(task);
                    }
                }}
                style={{
                    padding: '4px 8px',
                    backgroundColor: task.completed ? completedBg : centerChannelBg,
                    borderRadius: '4px',
                    marginBottom: '8px',
                    border: isDragging ? `2px dashed ${buttonBg}` : `1px solid ${borderColor}`,
                    borderLeft: deadlineColor ? `4px solid ${deadlineColor}` : `1px solid ${borderColor}`,
                    opacity: isDragging ? 0.4 : 1,
                    cursor: 'pointer',
                    transition: 'opacity 0.2s ease, border 0.2s ease',
                    userSelect: 'none',
                    position: 'relative'
                } as React.CSSProperties}
            >
                <div style={{ display: 'flex', alignItems: 'center' }} data-task-background="true">
                    <input
                        type="checkbox"
                        checked={task.completed}
                        onChange={() => onToggle(task)}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            marginLeft: '2px',
                            marginRight: '6px',
                            marginTop: '3px',
                            cursor: 'pointer',
                            flexShrink: 0
                        }}
                    />

                    <div style={{ flex: 1 }} data-task-background="true">
                        {isEditing ? (
                            <input
                                ref={inputRef}
                                type="text"
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                onKeyDown={handleKeyDown}
                                onBlur={handleSaveEdit}
                                style={{
                                    width: '100%',
                                    padding: '4px',
                                    fontSize: '14px',
                                    border: `2px solid ${buttonBg}`,
                                    borderRadius: '3px',
                                    backgroundColor: centerChannelBg,
                                    color: centerChannelColor,
                                    outline: 'none'
                                }}
                                onClick={(e) => e.stopPropagation()}
                            />
                        ) : (
                            <div style={{ display: 'inline-block' }}>
                                <span
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleTextClick();
                                    }}
                                    style={{
                                        textDecoration: task.completed ? 'line-through' : 'none',
                                        color: task.completed ? completedText : centerChannelColor,
                                        wordBreak: 'break-word',
                                        fontSize: '14px',
                                        lineHeight: '1.5',
                                        cursor: task.completed ? 'default' : 'text',
                                        padding: '4px 8px',
                                        borderRadius: '3px',
                                        transition: 'background-color 0.2s',
                                        display: 'inline-block'
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!task.completed) {
                                            e.currentTarget.style.backgroundColor = hoverBg;
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = 'transparent';
                                    }}
                                    title={task.completed ? '' : 'Click to edit'}
                                >
                                    {task.text}
                                </span>
                                {isEditingDeadline && (
                                    <div
                                        style={{
                                            marginTop: '4px',
                                            marginLeft: '12px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}
                                    >
                                        <input
                                            ref={deadlineInputRef}
                                            type="date"
                                            value={editDeadline}
                                            onChange={(e) => setEditDeadline(e.target.value)}
                                            onKeyDown={handleDeadlineKeyDown}
                                            onBlur={handleSaveDeadlineEdit}
                                            onClick={(e) => e.stopPropagation()}
                                            style={{
                                                padding: '4px 8px',
                                                fontSize: '12px',
                                                border: `2px solid ${buttonBg}`,
                                                borderRadius: '3px',
                                                backgroundColor: centerChannelBg,
                                                color: centerChannelColor,
                                                outline: 'none'
                                            }}
                                        />
                                        {editDeadline && (
                                            <button
                                                onMouseDown={async (e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();

                                                    const channelId = (window as any).store?.getState()?.entities?.channels?.currentChannelId;
                                                    if (!channelId) {
                                                        setIsEditingDeadline(false);
                                                        return;
                                                    }

                                                    try {
                                                        const updatedTask = {
                                                            ...task,
                                                            deadline: undefined
                                                        };

                                                        const response = await fetch(`/plugins/com.mattermost.channel-task/api/v1/tasks?channel_id=${channelId}`, {
                                                            method: 'PUT',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify(updatedTask)
                                                        });

                                                        if (response.ok) {
                                                            // Update the task prop immediately
                                                            task.deadline = undefined;
                                                            setEditDeadline('');
                                                            setIsEditingDeadline(false);
                                                            // Trigger parent reload
                                                            onUpdateText(task, task.text);
                                                        } else {
                                                            setIsEditingDeadline(false);
                                                        }
                                                    } catch (error) {
                                                        console.error('Error clearing deadline:', error);
                                                        setIsEditingDeadline(false);
                                                    }
                                                }}
                                                style={{
                                                    padding: '4px 8px',
                                                    fontSize: '14px',
                                                    color: errorTextColor,
                                                    backgroundColor: 'transparent',
                                                    border: 'none',
                                                    cursor: 'pointer'
                                                }}
                                                title="Remove deadline"
                                            >
                                                ×
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {hasValidDeadline && !isEditingDeadline && (
                        <div
                            onClick={handleDeadlineClick}
                            style={{
                                fontSize: '12px',
                                color: deadlineColor || adjustOpacity(centerChannelColor, centerChannelBg, 0.6),
                                marginTop: '2px',
                                marginLeft: '12px',
                                fontWeight: deadlineColor ? 500 : 400,
                                cursor: 'pointer',
                                padding: '2px 8px',
                                borderRadius: '3px',
                                display: 'inline-block',
                                transition: 'background-color 0.2s'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = hoverBg;
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                            title="Click to edit deadline"
                        >
                            {formatDeadline(task.deadline!)}
                        </div>
                    )}
                    {!hasValidDeadline && !isEditingDeadline && (
                        <div
                            onClick={handleDeadlineClick}
                            style={{
                                marginLeft: '6px',
                                cursor: 'pointer',
                                padding: '4px',
                                borderRadius: '3px',
                                transition: 'background-color 0.2s',
                                display: 'flex',
                                alignItems: 'center'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = hoverBg;
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                            title="Add deadline"
                        >
                            <i className="icon icon-calendar-outline" style={{ fontSize: '18px', color: dragHandleColor }} />
                        </div>
                    )}

                    <div style={{ position: 'relative', marginLeft: '6px', marginRight: '4px' }} ref={popupRef}>
                        <div
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowAssigneePopup(!showAssigneePopup);
                            }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                cursor: 'pointer',
                                padding: '2px'
                            }}
                            title="Assign members"
                        >
                            {assignedMembers.length === 0 ? (
                                <div style={{
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: '50%',
                                    backgroundColor: assigneeBg,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '16px',
                                    color: dragHandleColor
                                }}>
                                    <i className="icon icon-account-outline" />
                                </div>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    {assignedMembers.slice(0, 3).map((member, index) => (
                                        <img
                                            key={member.id}
                                            src={`/api/v4/users/${member.id}/image`}
                                            alt={member.username}
                                            style={{
                                                width: '28px',
                                                height: '28px',
                                                borderRadius: '50%',
                                                border: `2px solid ${centerChannelBg}`,
                                                marginLeft: index > 0 ? '-10px' : '0',
                                                position: 'relative',
                                                zIndex: 3 - index
                                            }}
                                            title={member.username}
                                        />
                                    ))}
                                    {assignedMembers.length > 3 && (
                                        <div style={{
                                            width: '28px',
                                            height: '28px',
                                            borderRadius: '50%',
                                            backgroundColor: dragHandleColor,
                                            color: centerChannelBg,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '11px',
                                            fontWeight: 'bold',
                                            border: `2px solid ${centerChannelBg}`,
                                            marginLeft: '-10px',
                                            position: 'relative',
                                            zIndex: 0
                                        }}>
                                            +{assignedMembers.length - 3}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {showAssigneePopup && (
                            <div style={{
                                position: 'absolute',
                                top: '100%',
                                right: 0,
                                marginTop: '4px',
                                backgroundColor: centerChannelBg,
                                border: `1px solid ${popupBorder}`,
                                borderRadius: '4px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                zIndex: 1000,
                                minWidth: '200px',
                                maxHeight: '300px',
                                overflowY: 'auto'
                            }}>
                                <div style={{
                                    padding: '8px 12px',
                                    borderBottom: `1px solid ${borderColor}`,
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    color: dragHandleColor
                                }}>
                                    Assign to
                                </div>
                                {channelMembers.map(member => {
                                    const isAssigned = assigneeIds.includes(member.id);
                                    return (
                                        <div
                                            key={member.id}
                                            onClick={() => onToggleAssignee(task, member.id)}
                                            style={{
                                                padding: '8px 12px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                cursor: 'pointer',
                                                backgroundColor: isAssigned ? selectedBg : 'transparent',
                                                borderLeft: isAssigned ? `3px solid ${buttonBg}` : '3px solid transparent'
                                            }}
                                            onMouseEnter={(e) => {
                                                if (!isAssigned) {
                                                    e.currentTarget.style.backgroundColor = hoverBg;
                                                }
                                            }}
                                            onMouseLeave={(e) => {
                                                if (!isAssigned) {
                                                    e.currentTarget.style.backgroundColor = 'transparent';
                                                }
                                            }}
                                        >
                                            <img
                                                src={`/api/v4/users/${member.id}/image`}
                                                alt={member.username}
                                                style={{
                                                    width: '24px',
                                                    height: '24px',
                                                    borderRadius: '50%',
                                                    marginRight: '8px'
                                                }}
                                            />
                                            <span style={{ flex: 1, fontSize: '14px', color: centerChannelColor }}>
                                                {member.username}
                                            </span>
                                            {isAssigned && (
                                                <i className="icon icon-check" style={{ color: buttonBg, fontSize: '16px' }} />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(task.id);
                        }}
                        style={{
                            padding: '4px 2px',
                            fontSize: '20px',
                            color: errorTextColor,
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            flexShrink: 0,
                            margin: '0 2px'
                        }}
                        title="Delete task"
                    >
                        ×
                    </button>
                </div>
            </div>

            {isDropTarget && dropPosition === 'after' && (
                <div style={{
                    position: 'absolute',
                    bottom: '-4px',
                    left: '0',
                    right: '0',
                    height: '3px',
                    backgroundColor: dropIndicatorColor,
                    borderRadius: '2px',
                    zIndex: 10,
                    boxShadow: `0 0 4px -2px ${dropIndicatorColor}`
                }} />
            )}
        </div>
    );
};

(window as any).registerPlugin('com.mattermost.channel-task', new Plugin());