import React from 'react';
import { TaskItem } from '../types';
import { adjustOpacity } from '../utils';

interface TaskItemComponentProps {
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
}

export const TaskItemComponent: React.FC<TaskItemComponentProps> = ({ task, channelMembers, onToggle, onDelete, onToggleAssignee, onUpdateText, onDragStart, onDragEnd, onDragOverTask, onDragLeaveTask, onDropOnTask, isDraggingItem, isDropTarget, dropPosition, theme }) => {
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
