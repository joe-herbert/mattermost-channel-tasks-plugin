import React, { useState, useEffect } from 'react';

// Types
interface TodoItem {
    id: string;
    text: string;
    completed: boolean;
    assignee_ids?: string[];
    group_id?: string;
    created_at: string;
    completed_at?: string;
}

interface TodoGroup {
    id: string;
    name: string;
    order?: string;
}

interface ChannelTodoList {
    items: TodoItem[];
    groups: TodoGroup[];
}

// Main Plugin Class
export default class Plugin {
    private store: any = null;
    private toggleRHSPlugin: any = null;

    public initialize(registry: any, store: any) {
        this.store = store;

        const {toggleRHSPlugin} = registry.registerRightHandSidebarComponent(
            TodoSidebar,
            'Channel Tasks'
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
class TodoSidebar extends React.Component<any> {
    private channelCheckInterval: any = null;

    state = {
        tasks: [] as TodoItem[],
        groups: [] as TodoGroup[],
        newTodoText: '',
        newGroupName: '',
        selectedGroup: '',
        channelMembers: [] as any[],
        showGroupForm: false,
        showTodoForm: false,
        draggedTodo: null as TodoItem | null,
        dragOverTodoId: null as string | null,
        dragOverPosition: null as 'before' | 'after' | null,
        draggedGroup: null as TodoGroup | null,
        dragOverGroupId: null as string | null,
        dragOverGroupPosition: null as 'before' | 'after' | null,
        filterMyTasks: false,
        currentUserId: '',
        _lastChannelId: '',
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
        console.log('TodoSidebar mounted with props:', this.props);
        this.loadCurrentUser();
        this.loadTodos();
        this.loadChannelMembers();

        this.channelCheckInterval = setInterval(() => {
            const currentChannelId = this.getChannelId();
            if (currentChannelId && currentChannelId !== this.state._lastChannelId) {
                console.log('Channel changed from', this.state._lastChannelId, 'to', currentChannelId);
                this.setState({ _lastChannelId: currentChannelId });
                this.loadTodos();
                this.loadChannelMembers();
            }
        }, 500);
    }

    componentWillUnmount() {
        if (this.channelCheckInterval) {
            clearInterval(this.channelCheckInterval);
        }
    }

    componentDidUpdate(prevProps: any) {
        const prevChannelId = this.getChannelId(prevProps);
        const currentChannelId = this.getChannelId(this.props);

        if (prevChannelId && currentChannelId && prevChannelId !== currentChannelId) {
            console.log('Channel changed via props from', prevChannelId, 'to', currentChannelId);
            this.setState({ _lastChannelId: currentChannelId });
            this.loadTodos();
            this.loadChannelMembers();
        }
    }

    getChannelId(props = this.props) {
        return props.channelId ||
            props.channel?.id ||
            (window as any).store?.getState()?.entities?.channels?.currentChannelId;
    }

    loadCurrentUser = async () => {
        try {
            const response = await fetch('/api/v4/users/me');
            const user = await response.json();
            this.setState({ currentUserId: user.id });
        } catch (error) {
            console.error('Error loading current user:', error);
        }
    };

    loadTodos = async () => {
        const channelId = this.getChannelId();
        console.log('Loading tasks for channel:', channelId);
        if (!channelId) return;

        try {
            const response = await fetch(`/plugins/com.mattermost.channel-todo/api/v1/todos?channel_id=${channelId}`);
            const data: ChannelTodoList = await response.json();
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

    addTodo = async () => {
        const { newTodoText, selectedGroup } = this.state;
        const channelId = this.getChannelId();
        console.log('Adding task:', newTodoText, 'for channel:', channelId);
        if (!newTodoText.trim() || !channelId) return;

        try {
            console.log('Sending POST request to add task');
            const response = await fetch(`/plugins/com.mattermost.channel-todo/api/v1/todos?channel_id=${channelId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: newTodoText,
                    completed: false,
                    group_id: selectedGroup || undefined
                })
            });

            console.log('Add task response:', response.status, response.ok);
            if (response.ok) {
                this.setState({ newTodoText: '' });
                this.loadTodos();
            } else {
                console.error('Failed to add task:', await response.text());
            }
        } catch (error) {
            console.error('Error adding task:', error);
        }
    };

    toggleTodo = async (task: TodoItem) => {
        const channelId = this.getChannelId();
        if (!channelId) return;

        try {
            await fetch(`/plugins/com.mattermost.channel-todo/api/v1/todos?channel_id=${channelId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...task,
                    completed: !task.completed
                })
            });
            this.loadTodos();
        } catch (error) {
            console.error('Error toggling task:', error);
        }
    };

    updateTodoText = async (task: TodoItem, newText: string) => {
        const channelId = this.getChannelId();
        if (!channelId || !newText.trim()) return;

        try {
            await fetch(`/plugins/com.mattermost.channel-todo/api/v1/todos?channel_id=${channelId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...task,
                    text: newText
                })
            });
            this.loadTodos();
        } catch (error) {
            console.error('Error updating task text:', error);
        }
    };

    deleteTodo = async (todoId: string) => {
        const channelId = this.getChannelId();
        if (!channelId) return;

        try {
            await fetch(`/plugins/com.mattermost.channel-todo/api/v1/todos?channel_id=${channelId}&id=${todoId}`, {
                method: 'DELETE'
            });
            this.loadTodos();
        } catch (error) {
            console.error('Error deleting task:', error);
        }
    };

    toggleAssignee = async (task: TodoItem, userId: string) => {
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
            await fetch(`/plugins/com.mattermost.channel-todo/api/v1/todos?channel_id=${channelId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...task,
                    assignee_ids: newAssignees
                })
            });
            this.loadTodos();
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
            const response = await fetch(`/plugins/com.mattermost.channel-todo/api/v1/groups?channel_id=${channelId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newGroupName })
            });
            console.log('Add group response:', response.status, response.ok);
            if (response.ok) {
                this.setState({ newGroupName: '' });
                this.loadTodos();
            } else {
                console.error('Failed to add group:', await response.text());
            }
        } catch (error) {
            console.error('Error adding group:', error);
        }
    };

    deleteGroup = async (groupId: string) => {
        const channelId = this.getChannelId();
        if (!channelId) return;

        try {
            await fetch(`/plugins/com.mattermost.channel-todo/api/v1/groups?channel_id=${channelId}&id=${groupId}`, {
                method: 'DELETE'
            });
            this.loadTodos();
        } catch (error) {
            console.error('Error deleting group:', error);
        }
    };

    handleDragStart = (task: TodoItem) => {
        console.log('Parent: handleDragStart called for task:', task.text);
        setTimeout(() => {
            this.setState({ draggedTodo: task });
        }, 0);
    };

    handleDragEnd = () => {
        console.log('handleDragEnd - clearing dragged task');
        this.setState({
            draggedTodo: null,
            dragOverTodoId: null,
            dragOverPosition: null
        });
    };

    handleDragOverTodo = (todoId: string, position: 'before' | 'after') => {
        if (this.state.draggedTodo?.id === todoId) {
            return;
        }
        this.setState({
            dragOverTodoId: todoId,
            dragOverPosition: position
        });
    };

    handleDragLeaveTodo = () => {
        this.setState({
            dragOverTodoId: null,
            dragOverPosition: null
        });
    };

    handleDropOnTodo = async (targetTodo: TodoItem, position: 'before' | 'after') => {
        const { draggedTodo } = this.state;
        const channelId = this.getChannelId();

        console.log('handleDropOnTodo called:', { draggedTodo, targetTodo, position, channelId });

        if (!draggedTodo || !channelId || draggedTodo.id === targetTodo.id) {
            this.setState({
                draggedTodo: null,
                dragOverTodoId: null,
                dragOverPosition: null
            });
            return;
        }

        try {
            const targetGroupId = targetTodo.group_id || null;
            const todosInGroup = this.state.tasks
                .filter(t => (t.group_id || null) === targetGroupId)
                .sort((a, b) => {
                    const aOrder = a.created_at || '';
                    const bOrder = b.created_at || '';
                    return aOrder.localeCompare(bOrder);
                });

            const targetIndex = todosInGroup.findIndex(t => t.id === targetTodo.id);

            let newOrder: string;
            if (position === 'before' && targetIndex > 0) {
                const prevTodo = todosInGroup[targetIndex - 1];
                const targetOrder = new Date(targetTodo.created_at).getTime();
                const prevOrder = new Date(prevTodo.created_at).getTime();
                newOrder = new Date((prevOrder + targetOrder) / 2).toISOString();
            } else if (position === 'after' && targetIndex < todosInGroup.length - 1) {
                const nextTodo = todosInGroup[targetIndex + 1];
                const targetOrder = new Date(targetTodo.created_at).getTime();
                const nextOrder = new Date(nextTodo.created_at).getTime();
                newOrder = new Date((targetOrder + nextOrder) / 2).toISOString();
            } else if (position === 'before') {
                newOrder = new Date(new Date(targetTodo.created_at).getTime() - 1000).toISOString();
            } else {
                newOrder = new Date(new Date(targetTodo.created_at).getTime() + 1000).toISOString();
            }

            const response = await fetch(`/plugins/com.mattermost.channel-todo/api/v1/todos?channel_id=${channelId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...draggedTodo,
                    group_id: targetGroupId || undefined,
                    created_at: newOrder
                })
            });

            if (response.ok) {
                console.log('Task reordered successfully');
                this.setState({
                    draggedTodo: null,
                    dragOverTodoId: null,
                    dragOverPosition: null
                });
                this.loadTodos();
            } else {
                console.error('Failed to reorder task:', response.status);
            }
        } catch (error) {
            console.error('Error reordering task:', error);
            this.setState({
                draggedTodo: null,
                dragOverTodoId: null,
                dragOverPosition: null
            });
        }
    };

    handleDrop = async (targetGroupId: string | null) => {
        const { draggedTodo } = this.state;
        const channelId = this.getChannelId();

        console.log('handleDrop called:', { draggedTodo, targetGroupId, channelId });

        if (!draggedTodo || !channelId) {
            console.log('No dragged task or channel ID');
            return;
        }

        const currentGroupId = draggedTodo.group_id || null;
        if (currentGroupId === targetGroupId) {
            console.log('Same group, no update needed');
            this.setState({ draggedTodo: null });
            return;
        }

        console.log('Updating task group from', currentGroupId, 'to', targetGroupId);

        try {
            const response = await fetch(`/plugins/com.mattermost.channel-todo/api/v1/todos?channel_id=${channelId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...draggedTodo,
                    group_id: targetGroupId || undefined
                })
            });

            if (response.ok) {
                console.log('Task updated successfully');
                this.setState({ draggedTodo: null });
                this.loadTodos();
            } else {
                console.error('Failed to update task:', response.status);
            }
        } catch (error) {
            console.error('Error moving task:', error);
            this.setState({ draggedTodo: null });
        }
    };

    handleDragStartGroup = (group: TodoGroup) => {
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

    handleDropOnGroup = async (targetGroup: TodoGroup, position: 'before' | 'after') => {
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

            const response = await fetch(`/plugins/com.mattermost.channel-todo/api/v1/groups?channel_id=${channelId}`, {
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
                this.loadTodos();
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

    groupedTodos = (groupId: string | null) => {
        const { filterMyTasks, currentUserId } = this.state;

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
        const { newTodoText, newGroupName, selectedGroup, channelMembers, showGroupForm, showTodoForm, draggedTodo, filterMyTasks, dragOverTodoId, dragOverPosition, draggedGroup, dragOverGroupId, dragOverGroupPosition } = this.state;

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
                        gap: '0',
                        border: `1px solid ${borderColor}`,
                        borderRadius: '4px',
                        overflow: 'hidden'
                    }}>
                        <button
                            onClick={() => this.setState({ filterMyTasks: false })}
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
                            onClick={() => this.setState({ filterMyTasks: true })}
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
                        marginBottom: '20px',
                        display: 'flex',
                        gap: '8px'
                    }}>
                        <button
                            onClick={() => this.setState({ showTodoForm: !showTodoForm, showGroupForm: false })}
                            style={{
                                flex: 1,
                                padding: '8px 12px',
                                fontSize: '14px',
                                fontWeight: 500,
                                backgroundColor: showTodoForm ? buttonBg : subtleBackground,
                                color: showTodoForm ? buttonColor : centerChannelColor,
                                border: `1px solid ${borderColor}`,
                                borderRadius: '4px',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            {showTodoForm ? '− Task' : '+ Task'}
                        </button>
                        <button
                            onClick={() => this.setState({ showGroupForm: !showGroupForm, showTodoForm: false })}
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
                            {showGroupForm ? '− Group' : '+ Group'}
                        </button>
                    </div>

                    {showTodoForm && (
                        <div style={{ marginBottom: '20px' }}>
                            <input
                                type="text"
                                value={newTodoText}
                                onChange={(e) => this.setState({ newTodoText: e.target.value })}
                                onKeyPress={(e) => e.key === 'Enter' && this.addTodo()}
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
                            <button
                                onClick={this.addTodo}
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
                        <TodoGroupSection
                            key={group.id}
                            title={group.name}
                            groupId={group.id}
                            group={group}
                            tasks={this.groupedTodos(group.id)}
                            channelMembers={channelMembers}
                            onToggle={this.toggleTodo}
                            onDelete={this.deleteTodo}
                            onToggleAssignee={this.toggleAssignee}
                            onUpdateText={this.updateTodoText}
                            onDeleteGroup={() => this.deleteGroup(group.id)}
                            onDragStart={this.handleDragStart}
                            onDragEnd={this.handleDragEnd}
                            onDrop={this.handleDrop}
                            onDragOverTodo={this.handleDragOverTodo}
                            onDragLeaveTodo={this.handleDragLeaveTodo}
                            onDropOnTodo={this.handleDropOnTodo}
                            isDragging={!!draggedTodo}
                            dragOverTodoId={dragOverTodoId}
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

                    <TodoGroupSection
                        title="Ungrouped"
                        groupId={null}
                        group={null}
                        tasks={this.groupedTodos(null)}
                        channelMembers={channelMembers}
                        onToggle={this.toggleTodo}
                        onDelete={this.deleteTodo}
                        onToggleAssignee={this.toggleAssignee}
                        onUpdateText={this.updateTodoText}
                        onDragStart={this.handleDragStart}
                        onDragEnd={this.handleDragEnd}
                        onDrop={this.handleDrop}
                        onDragOverTodo={this.handleDragOverTodo}
                        onDragLeaveTodo={this.handleDragLeaveTodo}
                        onDropOnTodo={this.handleDropOnTodo}
                        isDragging={!!draggedTodo}
                        dragOverTodoId={dragOverTodoId}
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
                </div>
            </div>
        );
    }
}

// Task Group Section Component
const TodoGroupSection: React.FC<{
    title: string;
    groupId: string | null;
    group: TodoGroup | null;
    tasks: TodoItem[];
    channelMembers: any[];
    onToggle: (task: TodoItem) => void;
    onDelete: (todoId: string) => void;
    onToggleAssignee: (task: TodoItem, userId: string) => void;
    onUpdateText: (task: TodoItem, newText: string) => void;
    onDeleteGroup?: () => void;
    onDragStart: (task: TodoItem) => void;
    onDragEnd: () => void;
    onDrop: (groupId: string | null) => void;
    onDragOverTodo: (todoId: string, position: 'before' | 'after') => void;
    onDragLeaveTodo: () => void;
    onDropOnTodo: (task: TodoItem, position: 'before' | 'after') => void;
    isDragging: boolean;
    dragOverTodoId: string | null;
    dragOverPosition: 'before' | 'after' | null;
    onDragStartGroup: (group: TodoGroup) => void;
    onDragEndGroup: () => void;
    onDragOverGroup: (groupId: string, position: 'before' | 'after') => void;
    onDragLeaveGroup: () => void;
    onDropOnGroup: (group: TodoGroup, position: 'before' | 'after') => void;
    isDraggingGroup: boolean;
    isDropTargetGroup: boolean;
    dropPositionGroup: 'before' | 'after' | null;
    theme: any;
}> = ({ title, groupId, group, tasks, channelMembers, onToggle, onDelete, onToggleAssignee, onUpdateText, onDeleteGroup, onDragStart, onDragEnd, onDrop, onDragOverTodo, onDragLeaveTodo, onDropOnTodo, isDragging, dragOverTodoId, dragOverPosition, onDragStartGroup, onDragEndGroup, onDragOverGroup, onDragLeaveGroup, onDropOnGroup, isDraggingGroup, isDropTargetGroup, dropPositionGroup, theme }) => {
    const [isDragOver, setIsDragOver] = React.useState(false);
    const [isDraggingThis, setIsDraggingThis] = React.useState(false);

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

    const isUngrouped = groupId === null;
    const hasContent = tasks.length > 0;
    const isCreatedGroup = onDeleteGroup !== undefined;

    const shouldShow = isCreatedGroup || hasContent || (isDragging && !isUngrouped) || (isDragging && isUngrouped);

    if (isUngrouped && !hasContent && !isDragging) {
        return null;
    }

    if (!shouldShow) return null;

    const showDropZone = isDragging && tasks.length === 0;
    const dropIndicatorColor = buttonBg;

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
                        border: isDraggingThis ? `2px dashed ${buttonBg}` : '2px solid transparent',
                        opacity: isDraggingThis ? 0.4 : 1,
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {group && (
                                <div
                                    style={{
                                        color: dragHandleColor,
                                        fontSize: '16px',
                                        cursor: 'grab',
                                        userSelect: 'none',
                                        lineHeight: '1'
                                    }}
                                    title="Drag to reorder groups"
                                >
                                    ⋮⋮
                                </div>
                            )}
                            <h4 style={{
                                margin: 0,
                                fontSize: '13px',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                color: subtleText,
                                letterSpacing: '0.5px'
                            }}>
                                {title}
                            </h4>
                        </div>
                        {onDeleteGroup && (
                            <button
                                onClick={onDeleteGroup}
                                style={{
                                    padding: '4px',
                                    fontSize: '20px',
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
                    transition: 'all 0.2s ease',
                    position: 'relative',
                    opacity: isDraggingThis ? 0.4 : 1,
                    cursor: group ? 'grab' : 'default'
                }}
            >
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: tasks.length > 0 ? '12px' : '0'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {group && (
                            <div
                                style={{
                                    color: dragHandleColor,
                                    fontSize: '16px',
                                    cursor: 'grab',
                                    userSelect: 'none',
                                    lineHeight: '1'
                                }}
                                title="Drag to reorder groups"
                            >
                                ⋮⋮
                            </div>
                        )}
                        <h4 style={{
                            margin: 0,
                            fontSize: '13px',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            color: subtleText,
                            letterSpacing: '0.5px'
                        }}>
                            {title}
                        </h4>
                    </div>
                    {onDeleteGroup && (
                        <button
                            onClick={onDeleteGroup}
                            style={{
                                padding: '4px',
                                fontSize: '20px',
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
                    <TodoItemComponent
                        key={task.id}
                        task={task}
                        channelMembers={channelMembers}
                        onToggle={onToggle}
                        onDelete={onDelete}
                        onToggleAssignee={onToggleAssignee}
                        onUpdateText={onUpdateText}
                        onDragStart={onDragStart}
                        onDragEnd={onDragEnd}
                        onDragOverTodo={onDragOverTodo}
                        onDragLeaveTodo={onDragLeaveTodo}
                        onDropOnTodo={onDropOnTodo}
                        isDraggingItem={isDragging}
                        isDropTarget={dragOverTodoId === task.id}
                        dropPosition={dragOverTodoId === task.id ? dragOverPosition : null}
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
const TodoItemComponent: React.FC<{
    task: TodoItem;
    channelMembers: any[];
    onToggle: (task: TodoItem) => void;
    onDelete: (todoId: string) => void;
    onToggleAssignee: (task: TodoItem, userId: string) => void;
    onUpdateText: (task: TodoItem, newText: string) => void;
    onDragStart: (task: TodoItem) => void;
    onDragEnd: () => void;
    onDragOverTodo: (todoId: string, position: 'before' | 'after') => void;
    onDragLeaveTodo: () => void;
    onDropOnTodo: (task: TodoItem, position: 'before' | 'after') => void;
    isDraggingItem: boolean;
    isDropTarget: boolean;
    dropPosition: 'before' | 'after' | null;
    theme: any;
}> = ({ task, channelMembers, onToggle, onDelete, onToggleAssignee, onUpdateText, onDragStart, onDragEnd, onDragOverTodo, onDragLeaveTodo, onDropOnTodo, isDraggingItem, isDropTarget, dropPosition, theme }) => {
    const [isDragging, setIsDragging] = React.useState(false);
    const [showAssigneePopup, setShowAssigneePopup] = React.useState(false);
    const [isEditing, setIsEditing] = React.useState(false);
    const [editText, setEditText] = React.useState(task.text);
    const popupRef = React.useRef<HTMLDivElement>(null);
    const inputRef = React.useRef<HTMLInputElement>(null);

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
    const completedBg = adjustOpacity(centerChannelColor, centerChannelBg, 0.03);
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
        onDragOverTodo(task.id, position);
    };

    const handleItemDragLeave = (e: React.DragEvent) => {
        const target = e.currentTarget as HTMLElement;
        const relatedTarget = e.relatedTarget as HTMLElement;

        if (!relatedTarget || !target.contains(relatedTarget)) {
            onDragLeaveTodo();
        }
    };

    const handleItemDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!dropPosition) return;

        onDropOnTodo(task, dropPosition);
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

    const assigneeIds = task.assignee_ids || [];
    const assignedMembers = channelMembers.filter(m => assigneeIds.includes(m.id));

    const dropIndicatorColor = buttonBg;

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
                style={{
                    padding: '4px 8px',
                    backgroundColor: task.completed ? completedBg : centerChannelBg,
                    borderRadius: '4px',
                    marginBottom: '8px',
                    border: isDragging ? `2px dashed ${buttonBg}` : `1px solid ${borderColor}`,
                    opacity: isDragging ? 0.4 : 1,
                    cursor: 'grab',
                    transition: 'opacity 0.2s ease, border 0.2s ease',
                    userSelect: 'none',
                    position: 'relative'
                } as React.CSSProperties}
            >
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div
                        style={{
                            marginRight: '8px',
                            color: dragHandleColor,
                            fontSize: '16px',
                            cursor: 'grab',
                            userSelect: 'none',
                            lineHeight: '1'
                        }}
                        title="Drag to move between groups"
                    >
                        ⋮⋮
                    </div>

                    <input
                        type="checkbox"
                        checked={task.completed}
                        onChange={() => onToggle(task)}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            marginRight: '10px',
                            marginTop: '3px',
                            cursor: 'pointer',
                            flexShrink: 0
                        }}
                    />

                    <div style={{ flex: 1 }}>
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
                                    padding: '4px 8px',
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
                            <div
                                onClick={handleTextClick}
                                style={{
                                    textDecoration: task.completed ? 'line-through' : 'none',
                                    color: task.completed ? completedText : centerChannelColor,
                                    wordBreak: 'break-word',
                                    fontSize: '14px',
                                    lineHeight: '1.5',
                                    cursor: task.completed ? 'default' : 'text',
                                    padding: '4px 8px',
                                    borderRadius: '3px',
                                    transition: 'background-color 0.2s'
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
                            </div>
                        )}
                    </div>

                    <div style={{ position: 'relative', marginLeft: '10px', marginRight: '4px' }} ref={popupRef}>
                        <div
                            onClick={() => setShowAssigneePopup(!showAssigneePopup)}
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

(window as any).registerPlugin('com.mattermost.channel-todo', new Plugin());