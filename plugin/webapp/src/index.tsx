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

        // Register RHS component - this returns the toggle action
        const {toggleRHSPlugin} = registry.registerRightHandSidebarComponent(
            TodoSidebar,
            'Channel Todos'
        );

        this.toggleRHSPlugin = toggleRHSPlugin;

        // Register channel header button
        registry.registerChannelHeaderButtonAction(
            () => <i className="icon icon-check" style={{ fontSize: '18px' }} />,
            () => {
                store.dispatch(toggleRHSPlugin);
            },
            'Todo List',
            'Open todo list for this channel'
        );

        // Register in channel menu dropdown
        registry.registerChannelHeaderMenuAction(
            'Todo List',
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
        todos: [] as TodoItem[],
        groups: [] as TodoGroup[],
        newTodoText: '',
        newGroupName: '',
        selectedGroup: '',
        channelMembers: [] as any[],
        showGroupForm: false,
        showTodoForm: false,
        draggedTodo: null as TodoItem | null,
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

        // Poll for channel changes every 500ms
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
        console.log('Loading todos for channel:', channelId);
        if (!channelId) return;

        try {
            const response = await fetch(`/plugins/com.mattermost.channel-todo/api/v1/todos?channel_id=${channelId}`);
            const data: ChannelTodoList = await response.json();
            this.setState({ todos: data.items, groups: data.groups });
        } catch (error) {
            console.error('Error loading todos:', error);
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
        console.log('Adding todo:', newTodoText, 'for channel:', channelId);
        if (!newTodoText.trim() || !channelId) return;

        try {
            console.log('Sending POST request to add todo');
            const response = await fetch(`/plugins/com.mattermost.channel-todo/api/v1/todos?channel_id=${channelId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: newTodoText,
                    completed: false,
                    group_id: selectedGroup || undefined
                })
            });

            console.log('Add todo response:', response.status, response.ok);
            if (response.ok) {
                this.setState({ newTodoText: '' });
                this.loadTodos();
            } else {
                console.error('Failed to add todo:', await response.text());
            }
        } catch (error) {
            console.error('Error adding todo:', error);
        }
    };

    toggleTodo = async (todo: TodoItem) => {
        const channelId = this.getChannelId();
        if (!channelId) return;

        try {
            await fetch(`/plugins/com.mattermost.channel-todo/api/v1/todos?channel_id=${channelId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...todo,
                    completed: !todo.completed
                })
            });
            this.loadTodos();
        } catch (error) {
            console.error('Error toggling todo:', error);
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
            console.error('Error deleting todo:', error);
        }
    };

    toggleAssignee = async (todo: TodoItem, userId: string) => {
        const channelId = this.getChannelId();
        if (!channelId) return;

        const currentAssignees = todo.assignee_ids || [];

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
                    ...todo,
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

    handleDragStart = (todo: TodoItem) => {
        console.log('Parent: handleDragStart called for todo:', todo.text);
        setTimeout(() => {
            this.setState({ draggedTodo: todo });
        }, 0);
    };

    handleDragEnd = () => {
        console.log('handleDragEnd - clearing dragged todo');
        this.setState({ draggedTodo: null });
    };

    handleDrop = async (targetGroupId: string | null) => {
        const { draggedTodo } = this.state;
        const channelId = this.getChannelId();

        console.log('handleDrop called:', { draggedTodo, targetGroupId, channelId });

        if (!draggedTodo || !channelId) {
            console.log('No dragged todo or channel ID');
            return;
        }

        const currentGroupId = draggedTodo.group_id || null;
        if (currentGroupId === targetGroupId) {
            console.log('Same group, no update needed');
            this.setState({ draggedTodo: null });
            return;
        }

        console.log('Updating todo group from', currentGroupId, 'to', targetGroupId);

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
                console.log('Todo updated successfully');
                this.setState({ draggedTodo: null });
                this.loadTodos();
            } else {
                console.error('Failed to update todo:', response.status);
            }
        } catch (error) {
            console.error('Error moving todo:', error);
            this.setState({ draggedTodo: null });
        }
    };

    groupedTodos = (groupId: string | null) => {
        const { filterMyTasks, currentUserId } = this.state;

        let filtered = this.state.todos.filter(todo => {
            if (groupId === null) {
                return !todo.group_id;
            }
            return todo.group_id === groupId;
        });

        if (filterMyTasks && currentUserId) {
            filtered = filtered.filter(todo => {
                const assigneeIds = todo.assignee_ids || [];
                return assigneeIds.includes(currentUserId);
            });
        }

        return filtered;
    };

    render() {
        const { newTodoText, newGroupName, selectedGroup, groups, channelMembers, showGroupForm, showTodoForm, draggedTodo, filterMyTasks } = this.state;

        // Theme is passed as a prop by Mattermost
        const theme = this.props.theme || {};

        // Theme colors with fallbacks
        const centerChannelBg = theme.centerChannelBg || '#ffffff';
        const centerChannelColor = theme.centerChannelColor || '#333333';
        const buttonBg = theme.buttonBg || '#1c58d9';
        const buttonColor = theme.buttonColor || '#ffffff';
        const onlineIndicator = theme.onlineIndicator || '#28a745';
        const errorTextColor = theme.errorTextColor || '#dc3545';

        // Derived colors
        const subtleBackground = this.adjustOpacity(centerChannelColor, centerChannelBg, 0.05);
        const borderColor = this.adjustOpacity(centerChannelColor, centerChannelBg, 0.1);
        const subtleText = this.adjustOpacity(centerChannelColor, centerChannelBg, 0.6);

        return (
            <div
                style={{
                    height: '100%',
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
                    {/* Filter Toggle */}
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

                    {/* Add Task/Group Buttons */}
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

                    {/* Add Todo Form */}
                    {showTodoForm && (
                        <div style={{ marginBottom: '20px' }}>
                            <input
                                type="text"
                                value={newTodoText}
                                onChange={(e) => this.setState({ newTodoText: e.target.value })}
                                onKeyPress={(e) => e.key === 'Enter' && this.addTodo()}
                                placeholder="Add new todo..."
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
                                {groups.map(group => (
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
                                Add Todo
                            </button>
                        </div>
                    )}

                    {/* Group Management */}
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

                    <TodoGroupSection
                        title="Ungrouped"
                        groupId={null}
                        todos={this.groupedTodos(null)}
                        channelMembers={channelMembers}
                        onToggle={this.toggleTodo}
                        onDelete={this.deleteTodo}
                        onToggleAssignee={this.toggleAssignee}
                        onDragStart={this.handleDragStart}
                        onDragEnd={this.handleDragEnd}
                        onDrop={this.handleDrop}
                        isDragging={!!draggedTodo}
                        theme={theme}
                    />

                    {groups.map(group => (
                        <TodoGroupSection
                            key={group.id}
                            title={group.name}
                            groupId={group.id}
                            todos={this.groupedTodos(group.id)}
                            channelMembers={channelMembers}
                            onToggle={this.toggleTodo}
                            onDelete={this.deleteTodo}
                            onToggleAssignee={this.toggleAssignee}
                            onDeleteGroup={() => this.deleteGroup(group.id)}
                            onDragStart={this.handleDragStart}
                            onDragEnd={this.handleDragEnd}
                            onDrop={this.handleDrop}
                            isDragging={!!draggedTodo}
                            theme={theme}
                        />
                    ))}

                    {this.state.todos.length === 0 && (
                        <div style={{
                            textAlign: 'center',
                            padding: '40px 20px',
                            color: subtleText
                        }}>
                            No todos yet. Add one above to get started!
                        </div>
                    )}
                </div>
            </div>
        );
    }
}

// Todo Group Section Component
const TodoGroupSection: React.FC<{
    title: string;
    groupId: string | null;
    todos: TodoItem[];
    channelMembers: any[];
    onToggle: (todo: TodoItem) => void;
    onDelete: (todoId: string) => void;
    onToggleAssignee: (todo: TodoItem, userId: string) => void;
    onDeleteGroup?: () => void;
    onDragStart: (todo: TodoItem) => void;
    onDragEnd: () => void;
    onDrop: (groupId: string | null) => void;
    isDragging: boolean;
    theme: any;
}> = ({ title, groupId, todos, channelMembers, onToggle, onDelete, onToggleAssignee, onDeleteGroup, onDragStart, onDragEnd, onDrop, isDragging, theme }) => {
    const [isDragOver, setIsDragOver] = React.useState(false);

    // Theme colors with fallbacks
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

    const isUngrouped = groupId === null;
    const hasContent = todos.length > 0;
    const isCreatedGroup = onDeleteGroup !== undefined;

    const shouldShow = isCreatedGroup || hasContent || (isDragging && !isUngrouped) || (isDragging && isUngrouped);

    if (isUngrouped && !hasContent && !isDragging) {
        return null;
    }

    if (!shouldShow) return null;

    const showDropZone = isDragging && todos.length === 0;

    if (!hasContent && !showDropZone) {
        return (
            <div
                style={{
                    marginBottom: '20px',
                    minHeight: '60px',
                    borderRadius: '8px',
                    padding: '12px',
                    border: '2px solid transparent',
                    position: 'relative',
                    transition: 'all 0.2s ease'
                }}
            >
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
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
                    {onDeleteGroup && (
                        <button
                            onClick={onDeleteGroup}
                            style={{
                                padding: '4px 8px',
                                fontSize: '11px',
                                backgroundColor: errorTextColor,
                                color: 'white',
                                border: 'none',
                                borderRadius: '3px',
                                cursor: 'pointer'
                            }}
                        >
                            Delete
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div
            style={{
                marginBottom: '20px',
                minHeight: showDropZone ? '80px' : 'auto',
                backgroundColor: isDragOver ? dropZoneBg : (showDropZone ? adjustOpacity(centerChannelColor, centerChannelBg, 0.02) : 'transparent'),
                border: isDragOver ? `2px dashed ${buttonBg}` : (showDropZone ? `2px dashed ${borderColor}` : 'none'),
                borderRadius: '8px',
                padding: '12px',
                transition: 'all 0.2s ease',
                position: 'relative'
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: todos.length > 0 ? '12px' : '0'
            }}>
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
                {onDeleteGroup && (
                    <button
                        onClick={onDeleteGroup}
                        style={{
                            padding: '4px 8px',
                            fontSize: '11px',
                            backgroundColor: errorTextColor,
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer'
                        }}
                    >
                        Delete
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

            {todos.map(todo => (
                <TodoItemComponent
                    key={todo.id}
                    todo={todo}
                    channelMembers={channelMembers}
                    onToggle={onToggle}
                    onDelete={onDelete}
                    onToggleAssignee={onToggleAssignee}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    theme={theme}
                />
            ))}
        </div>
    );
};

// Individual Todo Item Component
const TodoItemComponent: React.FC<{
    todo: TodoItem;
    channelMembers: any[];
    onToggle: (todo: TodoItem) => void;
    onDelete: (todoId: string) => void;
    onToggleAssignee: (todo: TodoItem, userId: string) => void;
    onDragStart: (todo: TodoItem) => void;
    onDragEnd: () => void;
    theme: any;
}> = ({ todo, channelMembers, onToggle, onDelete, onToggleAssignee, onDragStart, onDragEnd, theme }) => {
    const [isDragging, setIsDragging] = React.useState(false);
    const [showAssigneePopup, setShowAssigneePopup] = React.useState(false);
    const popupRef = React.useRef<HTMLDivElement>(null);

    // Theme colors with fallbacks
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

    const handleDragStart = (e: React.DragEvent) => {
        setIsDragging(true);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', todo.id);
        e.dataTransfer.dropEffect = 'move';
        onDragStart(todo);
    };

    const handleDragEnd = (e: React.DragEvent) => {
        setIsDragging(false);
        onDragEnd();
    };

    const handleDrag = (e: React.DragEvent) => {
        // Continuously fires during drag
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'BUTTON') {
            return;
        }
    };

    const assigneeIds = todo.assignee_ids || [];
    const assignedMembers = channelMembers.filter(m => assigneeIds.includes(m.id));

    return (
        <div
            draggable="true"
            onDragStart={handleDragStart}
            onDrag={handleDrag}
            onDragEnd={handleDragEnd}
            onMouseDown={handleMouseDown}
            onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
            }}
            style={{
                padding: '12px',
                backgroundColor: todo.completed ? completedBg : centerChannelBg,
                borderRadius: '4px',
                marginBottom: '8px',
                border: isDragging ? `2px dashed ${buttonBg}` : `1px solid ${borderColor}`,
                opacity: isDragging ? 0.4 : 1,
                cursor: 'grab',
                transition: 'opacity 0.2s ease, border 0.2s ease',
                userSelect: 'none'
            } as React.CSSProperties}
        >
            <div style={{ display: 'flex', alignItems: 'flex-start' }}>
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
                    checked={todo.completed}
                    onChange={() => onToggle(todo)}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        marginRight: '10px',
                        marginTop: '3px',
                        cursor: 'pointer',
                        flexShrink: 0
                    }}
                />

                <div style={{
                    flex: 1,
                    textDecoration: todo.completed ? 'line-through' : 'none',
                    color: todo.completed ? completedText : centerChannelColor,
                    wordBreak: 'break-word',
                    fontSize: '14px',
                    lineHeight: '1.5'
                }}>
                    {todo.text}
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
                                        onClick={() => onToggleAssignee(todo, member.id)}
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
                        onDelete(todo.id);
                    }}
                    style={{
                        padding: '4px 8px',
                        fontSize: '16px',
                        color: errorTextColor,
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        flexShrink: 0,
                        marginLeft: '8px'
                    }}
                    title="Delete todo"
                >
                    ×
                </button>
            </div>
        </div>
    );
};

(window as any).registerPlugin('com.mattermost.channel-todo', new Plugin());