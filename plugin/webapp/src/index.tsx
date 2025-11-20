import React, { useState, useEffect } from 'react';

// Types
interface TodoItem {
    id: string;
    text: string;
    completed: boolean;
    assignee_id?: string;
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

    public initialize(registry: any, store: any) {
        this.store = store;

        // Register channel header button
        registry.registerChannelHeaderButtonAction(
            () => <i className="icon icon-check" style={{ fontSize: '18px' }} />,
            () => {
                const state = store.getState();
                const currentChannelId = state.entities?.channels?.currentChannelId;
                const channel = state.entities?.channels?.channels?.[currentChannelId];

                if (channel) {
                    this.showTodoModal(channel);
                }
            },
            'Todo List',
            'Open todo list for this channel'
        );

        // Register in channel menu dropdown
        registry.registerChannelHeaderMenuAction(
            'Todo List',
            (channelId: string) => {
                const state = store.getState();
                const channel = state.entities?.channels?.channels?.[channelId];
                if (channel) {
                    this.showTodoModal(channel);
                }
            },
            () => <i className="icon icon-check" />
        );
    }

    private showTodoModal(channel: any) {
        // Create a modal div
        const modalRoot = document.createElement('div');
        modalRoot.id = 'todo-modal-root';
        document.body.appendChild(modalRoot);

        // Import React and ReactDOM from window
        const React = (window as any).React;
        const ReactDOM = (window as any).ReactDOM;

        const closeModal = () => {
            ReactDOM.unmountComponentAtNode(modalRoot);
            document.body.removeChild(modalRoot);
        };

        // Render the modal
        ReactDOM.render(
            React.createElement(TodoModal, { channel, onClose: closeModal }),
            modalRoot
        );
    }
}

// Modal Component
class TodoModal extends React.Component<{ channel: any; onClose: () => void }> {
    state = {
        todos: [] as TodoItem[],
        groups: [] as TodoGroup[],
        newTodoText: '',
        newGroupName: '',
        selectedGroup: '',
        channelMembers: [] as any[],
        showGroupForm: false,
        draggedTodo: null as TodoItem | null,
    };

    componentDidMount() {
        this.loadTodos();
        this.loadChannelMembers();

        // Add escape key listener
        document.addEventListener('keydown', this.handleEscape);
    }

    componentWillUnmount() {
        document.removeEventListener('keydown', this.handleEscape);
    }

    handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            this.props.onClose();
        }
    };

    loadTodos = async () => {
        const channelId = this.props.channel?.id;
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
        const channelId = this.props.channel?.id;
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
        const channelId = this.props.channel?.id;
        if (!newTodoText.trim() || !channelId) return;

        try {
            const response = await fetch(`/plugins/com.mattermost.channel-todo/api/v1/todos?channel_id=${channelId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: newTodoText,
                    completed: false,
                    group_id: selectedGroup || undefined
                })
            });

            if (response.ok) {
                this.setState({ newTodoText: '' });
                this.loadTodos();
            }
        } catch (error) {
            console.error('Error adding todo:', error);
        }
    };

    toggleTodo = async (todo: TodoItem) => {
        const channelId = this.props.channel?.id;
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
        const channelId = this.props.channel?.id;
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

    updateTodoAssignee = async (todo: TodoItem, assigneeId: string) => {
        const channelId = this.props.channel?.id;
        if (!channelId) return;

        try {
            await fetch(`/plugins/com.mattermost.channel-todo/api/v1/todos?channel_id=${channelId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...todo,
                    assignee_id: assigneeId
                })
            });
            this.loadTodos();
        } catch (error) {
            console.error('Error updating assignee:', error);
        }
    };

    addGroup = async () => {
        const { newGroupName } = this.state;
        const channelId = this.props.channel?.id;
        if (!newGroupName.trim() || !channelId) return;

        try {
            await fetch(`/plugins/com.mattermost.channel-todo/api/v1/groups?channel_id=${channelId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newGroupName })
            });
            this.setState({ newGroupName: '', showGroupForm: false });
            this.loadTodos();
        } catch (error) {
            console.error('Error adding group:', error);
        }
    };

    deleteGroup = async (groupId: string) => {
        const channelId = this.props.channel?.id;
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
        // Use setTimeout to defer the state update until after the drag has been initiated
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
        const channelId = this.props.channel?.id;

        console.log('handleDrop called:', { draggedTodo, targetGroupId, channelId });

        if (!draggedTodo || !channelId) {
            console.log('No dragged todo or channel ID');
            return;
        }

        // Only update if the group actually changed
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
        return this.state.todos.filter(todo => {
            if (groupId === null) {
                return !todo.group_id;
            }
            return todo.group_id === groupId;
        });
    };

    render() {
        const { newTodoText, newGroupName, selectedGroup, groups, channelMembers, showGroupForm, draggedTodo } = this.state;
        const channelName = this.props.channel?.display_name || 'Channel';

        return (
            <div
                style={{
                    position: 'fixed',
                    top: 0,
                    right: 0,
                    bottom: 0,
                    width: '400px',
                    backgroundColor: '#fff',
                    boxShadow: '-2px 0 8px rgba(0,0,0,0.15)',
                    zIndex: 9999,
                    display: 'flex',
                    flexDirection: 'column'
                }}
            >
                {/* Header */}
                <div style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid #ddd',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
                            Todo List
                        </h3>
                        <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                            {channelName}
                        </div>
                    </div>
                    <button
                        onClick={this.props.onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            fontSize: '24px',
                            cursor: 'pointer',
                            padding: '0',
                            width: '32px',
                            height: '32px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#666'
                        }}
                    >
                        ×
                    </button>
                </div>

                {/* Content */}
                <div
                    style={{ flex: 1, overflowY: 'auto', padding: '20px' }}
                    onDragOver={(e) => {
                        // Make the scroll container a valid drop target
                        e.preventDefault();
                    }}
                >
                    {/* Add Todo Form */}
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
                                border: '1px solid #ddd',
                                borderRadius: '4px',
                                fontSize: '14px'
                            }}
                        />
                        <select
                            value={selectedGroup}
                            onChange={(e) => this.setState({ selectedGroup: e.target.value })}
                            style={{
                                width: '100%',
                                padding: '10px',
                                marginBottom: '8px',
                                border: '1px solid #ddd',
                                borderRadius: '4px',
                                fontSize: '14px'
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
                                backgroundColor: '#1c58d9',
                                color: 'white',
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

                    {/* Group Management */}
                    <div style={{ marginBottom: '20px' }}>
                        <button
                            onClick={() => this.setState({ showGroupForm: !showGroupForm })}
                            style={{
                                padding: '6px 12px',
                                fontSize: '13px',
                                backgroundColor: '#f5f5f5',
                                border: '1px solid #ddd',
                                borderRadius: '4px',
                                cursor: 'pointer'
                            }}
                        >
                            {showGroupForm ? 'Cancel' : '+ Add Group'}
                        </button>

                        {showGroupForm && (
                            <div style={{ marginTop: '10px' }}>
                                <input
                                    type="text"
                                    value={newGroupName}
                                    onChange={(e) => this.setState({ newGroupName: e.target.value })}
                                    onKeyPress={(e) => e.key === 'Enter' && this.addGroup()}
                                    placeholder="Group name..."
                                    style={{
                                        width: '100%',
                                        padding: '8px',
                                        marginBottom: '8px',
                                        border: '1px solid #ddd',
                                        borderRadius: '4px',
                                        fontSize: '13px'
                                    }}
                                />
                                <button
                                    onClick={this.addGroup}
                                    style={{
                                        width: '100%',
                                        padding: '8px',
                                        backgroundColor: '#28a745',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '4px',
                                        fontSize: '13px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Create Group
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Todo List */}
                    <TodoGroupSection
                        title="Ungrouped"
                        groupId={null}
                        todos={this.groupedTodos(null)}
                        channelMembers={channelMembers}
                        onToggle={this.toggleTodo}
                        onDelete={this.deleteTodo}
                        onUpdateAssignee={this.updateTodoAssignee}
                        onDragStart={this.handleDragStart}
                        onDragEnd={this.handleDragEnd}
                        onDrop={this.handleDrop}
                        isDragging={!!draggedTodo}
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
                            onUpdateAssignee={this.updateTodoAssignee}
                            onDeleteGroup={() => this.deleteGroup(group.id)}
                            onDragStart={this.handleDragStart}
                            onDragEnd={this.handleDragEnd}
                            onDrop={this.handleDrop}
                            isDragging={!!draggedTodo}
                        />
                    ))}

                    {this.state.todos.length === 0 && (
                        <div style={{
                            textAlign: 'center',
                            padding: '40px 20px',
                            color: '#888'
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
    onUpdateAssignee: (todo: TodoItem, assigneeId: string) => void;
    onDeleteGroup?: () => void;
    onDragStart: (todo: TodoItem) => void;
    onDragEnd: () => void;
    onDrop: (groupId: string | null) => void;
    isDragging: boolean;
}> = ({ title, groupId, todos, channelMembers, onToggle, onDelete, onUpdateAssignee, onDeleteGroup, onDragStart, onDragEnd, onDrop, isDragging }) => {
    const [isDragOver, setIsDragOver] = React.useState(false);

    // Reset drag over state when dragging stops
    React.useEffect(() => {
        if (!isDragging) {
            setIsDragOver(false);
        }
    }, [isDragging]);

    const handleDragOver = (e: React.DragEvent) => {
        console.log('Drag over group:', title);
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setIsDragOver(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        // Check if we're leaving the drop zone container itself, not just entering a child
        const target = e.currentTarget as HTMLElement;
        const relatedTarget = e.relatedTarget as HTMLElement;

        // If relatedTarget is null or not a descendant of the drop zone, we've truly left
        if (!relatedTarget || !target.contains(relatedTarget)) {
            setIsDragOver(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('Drop triggered for group:', title, groupId);
        setIsDragOver(false);
        onDrop(groupId);
    };

    // Always show Ungrouped (groupId === null)
    // Show groups if they have todos OR if we're currently dragging
    // Show groups with delete buttons (created groups) even if empty
    const isUngrouped = groupId === null;
    const hasContent = todos.length > 0;
    const isCreatedGroup = onDeleteGroup !== undefined;

    const shouldShow = isUngrouped || hasContent || isDragging || isCreatedGroup;

    if (!shouldShow) return null;

    // Show empty state message when dragging and section is empty
    const showDropZone = isDragging && todos.length === 0;

    // If it's an empty group that's not showing a drop zone, render minimal markup
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
                        color: '#666',
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
                                backgroundColor: '#dc3545',
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
                backgroundColor: isDragOver ? '#f0f8ff' : (showDropZone ? '#fafafa' : 'transparent'),
                border: isDragOver ? '2px dashed #1c58d9' : (showDropZone ? '2px dashed #ddd' : 'none'),
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
                    color: '#666',
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
                            backgroundColor: '#dc3545',
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
                    color: isDragOver ? '#1c58d9' : '#999',
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
                    onUpdateAssignee={onUpdateAssignee}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
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
    onUpdateAssignee: (todo: TodoItem, assigneeId: string) => void;
    onDragStart: (todo: TodoItem) => void;
    onDragEnd: () => void;
}> = ({ todo, channelMembers, onToggle, onDelete, onUpdateAssignee, onDragStart, onDragEnd }) => {
    const [isDragging, setIsDragging] = React.useState(false);

    const handleDragStart = (e: React.DragEvent) => {
        console.log('=== DRAG START ===');
        console.log('Todo:', todo.text, 'Group ID:', todo.group_id);

        setIsDragging(true);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', todo.id);
        e.dataTransfer.dropEffect = 'move';

        // Call parent handler after setting up the dataTransfer
        onDragStart(todo);
    };

    const handleDragEnd = (e: React.DragEvent) => {
        console.log('=== DRAG END ===');
        console.log('Todo:', todo.text);
        console.log('Drop effect:', e.dataTransfer.dropEffect);

        setIsDragging(false);
        onDragEnd();
    };

    const handleDrag = (e: React.DragEvent) => {
        // Continuously fires during drag - prevent any cancellation
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        console.log('Mouse down on todo item, target:', (e.target as HTMLElement).tagName);
        // Don't prevent default on the drag handle or when clicking on interactive elements
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'BUTTON') {
            // For interactive elements, do nothing - let them work normally
            return;
        }
        // Don't prevent default - we need the browser to start the drag
    };

    return (
        <div
            draggable="true"
            onDragStart={handleDragStart}
            onDrag={handleDrag}
            onDragEnd={handleDragEnd}
            onMouseDown={handleMouseDown}
            onDragOver={(e) => {
                // Prevent the item from being a drop target for itself
                e.preventDefault();
                e.stopPropagation();
            }}
            style={{
                padding: '12px',
                backgroundColor: todo.completed ? '#f8f9fa' : '#fff',
                borderRadius: '4px',
                marginBottom: '8px',
                border: isDragging ? '2px dashed #1c58d9' : '1px solid #e9ecef',
                opacity: isDragging ? 0.4 : 1,
                cursor: 'grab',
                transition: 'opacity 0.2s ease, border 0.2s ease',
                userSelect: 'none'
            } as React.CSSProperties}
        >
            <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div
                    style={{
                        marginRight: '8px',
                        color: '#999',
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
                    color: todo.completed ? '#888' : '#333',
                    wordBreak: 'break-word',
                    fontSize: '14px',
                    lineHeight: '1.5'
                }}>
                    {todo.text}
                </div>

                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete(todo.id);
                    }}
                    style={{
                        padding: '4px 8px',
                        fontSize: '16px',
                        color: '#dc3545',
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

            <select
                value={todo.assignee_id || ''}
                onChange={(e) => {
                    e.stopPropagation();
                    onUpdateAssignee(todo, e.target.value);
                }}
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: '12px',
                    border: '1px solid #ddd',
                    borderRadius: '3px',
                    cursor: 'pointer'
                }}
            >
                <option value="">Unassigned</option>
                {channelMembers.map(member => (
                    <option key={member.id} value={member.id}>
                        @{member.username || member.id}
                    </option>
                ))}
            </select>
        </div>
    );
};

(window as any).registerPlugin('com.mattermost.channel-todo', new Plugin());