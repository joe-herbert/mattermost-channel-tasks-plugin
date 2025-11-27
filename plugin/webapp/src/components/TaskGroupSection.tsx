import React from 'react';
import {TaskGroup, TaskItem} from '../types';
import {adjustOpacity} from '../utils';
import {TaskItemComponent} from './TaskItemComponent';

interface TaskGroupSectionProps {
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
    showNotes: (task: TaskItem) => void;
    hideAssignees?: boolean;
}

export const TaskGroupSection: React.FC<TaskGroupSectionProps> = ({
                                                                      title, groupId, group, tasks, channelMembers, onToggle, onDelete, onToggleAssignee, onUpdateText,
                                                                      onDeleteGroup, onUpdateGroupName, onDragStart, onDragEnd, onDrop, onDragOverTask, onDragLeaveTask,
                                                                      onDropOnTask, isDragging, dragOverTaskId, dragOverPosition, onDragStartGroup, onDragEndGroup,
                                                                      onDragOverGroup, onDragLeaveGroup, onDropOnGroup, isDraggingGroup, isDropTargetGroup, dropPositionGroup,
                                                                      theme, showNotes, hideAssignees
                                                                  }) => {
    const [isDragOver, setIsDragOver] = React.useState(false);
    const [isDraggingThis, setIsDraggingThis] = React.useState(false);
    const [isEditingName, setIsEditingName] = React.useState(false);
    const [editName, setEditName] = React.useState(title);
    const [isHeaderHovered, setIsHeaderHovered] = React.useState(false);
    const [isCollapsed, setIsCollapsed] = React.useState(false);
    const [isAnimating, setIsAnimating] = React.useState(false);
    const [contentHeight, setContentHeight] = React.useState<number>(0);
    const nameInputRef = React.useRef<HTMLInputElement>(null);
    const contentRef = React.useRef<HTMLDivElement>(null);

    const centerChannelBg = theme?.centerChannelBg || '#ffffff';
    const centerChannelColor = theme?.centerChannelColor || '#333333';
    const buttonBg = theme?.buttonBg || '#1c58d9';
    const errorTextColor = theme?.errorTextColor || '#dc3545';

    const borderColor = adjustOpacity(centerChannelColor, centerChannelBg, 0.1);
    const subtleText = adjustOpacity(centerChannelColor, centerChannelBg, 0.6);
    const dropZoneBg = adjustOpacity(buttonBg, centerChannelBg, 0.1);

    React.useEffect(() => {
        if (!isDragging) setIsDragOver(false);
    }, [isDragging]);

    React.useEffect(() => {
        if (isEditingName && nameInputRef.current) {
            nameInputRef.current.focus();
            nameInputRef.current.select();
        }
    }, [isEditingName]);

    React.useEffect(() => {
        if (!contentRef.current) return;

        const updateHeight = () => {
            if (contentRef.current) {
                // Calculate height based on children, excluding absolutely positioned elements like popups
                let totalHeight = 0;
                const children = contentRef.current.children;
                for (let i = 0; i < children.length; i++) {
                    const child = children[i] as HTMLElement;
                    // Get the bounding rect which gives us the actual rendered height
                    const rect = child.getBoundingClientRect();
                    // Get margins from the outer wrapper
                    const style = window.getComputedStyle(child);
                    const marginTop = parseFloat(style.marginTop) || 0;
                    const marginBottom = parseFloat(style.marginBottom) || 0;
                    // Also check for margin on the first child (the actual task div with marginBottom)
                    const firstChild = child.firstElementChild as HTMLElement;
                    let innerMarginBottom = 0;
                    if (firstChild) {
                        const innerStyle = window.getComputedStyle(firstChild);
                        innerMarginBottom = parseFloat(innerStyle.marginBottom) || 0;
                    }
                    totalHeight += rect.height + marginTop + marginBottom + innerMarginBottom;
                }
                setContentHeight(totalHeight);
            }
        };

        updateHeight();

        const resizeObserver = new ResizeObserver(updateHeight);
        resizeObserver.observe(contentRef.current);

        return () => resizeObserver.disconnect();
    }, [tasks]);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setIsDragOver(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        const target = e.currentTarget as HTMLElement;
        const relatedTarget = e.relatedTarget as HTMLElement;
        if (!relatedTarget || !target.contains(relatedTarget)) setIsDragOver(false);
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

    const handleGroupDragEnd = () => {
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
        const position = e.clientY < midpoint ? 'before' : 'after';
        onDragOverGroup(group.id, position);
    };

    const handleGroupDragLeave = (e: React.DragEvent) => {
        if (!isDraggingGroup) return;
        const target = e.currentTarget as HTMLElement;
        const relatedTarget = e.relatedTarget as HTMLElement;
        if (!relatedTarget || !target.contains(relatedTarget)) onDragLeaveGroup();
    };

    const handleGroupDrop = (e: React.DragEvent) => {
        if (!group || !isDraggingGroup) return;
        e.preventDefault();
        e.stopPropagation();
        if (!dropPositionGroup) return;
        onDropOnGroup(group, dropPositionGroup);
    };

    const handleNameClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (group && onUpdateGroupName) {
            setIsEditingName(true);
            setEditName(title);
        }
    };

    const handleHeaderClick = () => {
        setIsAnimating(true);
        setIsCollapsed(!isCollapsed);
        setTimeout(() => setIsAnimating(false), 300);
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
        if (e.key === 'Enter') handleSaveNameEdit();
        else if (e.key === 'Escape') handleCancelNameEdit();
    };

    const isUngrouped = groupId === null;
    const hasContent = tasks.length > 0;
    const isCreatedGroup = onDeleteGroup !== undefined;
    const isFiltered = !hasContent && isCreatedGroup;
    const shouldShow = isCreatedGroup || hasContent || (isDragging && !isUngrouped) || (isDragging && isUngrouped);

    if (isUngrouped && !hasContent && !isDragging) return null;
    if (!shouldShow) return null;

    const showDropZone = isDragging && tasks.length === 0;
    const dropIndicatorColor = buttonBg;
    const groupOpacity = isFiltered ? 0.5 : 1;

    // Only use overflow:hidden during animation, otherwise visible for menus
    const shouldClipOverflow = isAnimating || isCollapsed;

    const renderDeleteButton = () => {
        if (!onDeleteGroup) return null;
        return (
            <button onClick={(e) => {
                e.stopPropagation();
                onDeleteGroup();
            }} style={{
                padding: '4px', fontSize: '12px', color: errorTextColor, backgroundColor: 'transparent',
                border: 'none', cursor: 'pointer', opacity: isHeaderHovered ? 1 : 0, transition: 'opacity 0.3s'
            }}>
                Delete Group
            </button>
        );
    };

    const renderHeader = () => (
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: tasks.length > 0 ? '4px' : '0', cursor: 'pointer'}}
             onMouseEnter={() => setIsHeaderHovered(true)} onMouseLeave={() => setIsHeaderHovered(false)}
             onClick={handleHeaderClick}>
            <div style={{display: 'flex', alignItems: 'center', gap: '4px'}}>
                <i className="icon icon-chevron-down" style={{transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: "transform 0.3s ease", color: subtleText}}></i>
                {isEditingName ? (
                    <input ref={nameInputRef} type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                           onKeyDown={handleNameKeyDown} onBlur={handleSaveNameEdit} onClick={(e) => e.stopPropagation()}
                           style={{
                               padding: '4px 8px', fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px',
                               border: `2px solid ${buttonBg}`, borderRadius: '3px', backgroundColor: centerChannelBg, color: centerChannelColor, outline: 'none'
                           }}/>
                ) : (
                    <h4 onClick={handleNameClick} style={{
                        margin: 0, fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', color: subtleText, letterSpacing: '0.5px',
                        cursor: (group && onUpdateGroupName) ? 'text' : 'pointer', padding: '4px 8px', borderRadius: '3px', transition: 'background-color 0.3s'
                    }} onMouseEnter={(e) => {
                        if (group && onUpdateGroupName) e.currentTarget.style.backgroundColor = adjustOpacity(centerChannelColor, centerChannelBg, 0.05);
                    }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                        title={(group && onUpdateGroupName) ? 'Click to edit' : ''}>
                        {title}
                    </h4>
                )}
            </div>
            {renderDeleteButton()}
        </div>
    );

    if (!hasContent && !showDropZone) {
        return (
            <div style={{position: 'relative'}}>
                {isDraggingGroup && isDropTargetGroup && dropPositionGroup === 'before' && (
                    <div style={{position: 'absolute', top: '-4px', left: '0', right: '0', height: '3px', backgroundColor: dropIndicatorColor, borderRadius: '2px', zIndex: 10, boxShadow: `0 0 4px -2px ${dropIndicatorColor}`}}/>
                )}
                <div draggable={!!group} onDragStart={handleGroupDragStart} onDragEnd={handleGroupDragEnd}
                     onDragOver={handleGroupDragOver} onDragLeave={handleGroupDragLeave} onDrop={handleGroupDrop}
                     style={{
                         marginBottom: '0px', minHeight: '60px', borderRadius: '8px', padding: '8px', paddingBottom: '4px',
                         border: isDraggingThis ? `2px dashed ${buttonBg}` : '2px solid transparent',
                         opacity: isDraggingThis ? 0.4 : groupOpacity, position: 'relative', transition: 'all 0.3s ease', cursor: group ? 'grab' : 'default'
                     }}>
                    {renderHeader()}
                </div>
                {isDraggingGroup && isDropTargetGroup && dropPositionGroup === 'after' && (
                    <div style={{position: 'absolute', bottom: '4px', left: '0', right: '0', height: '3px', backgroundColor: dropIndicatorColor, borderRadius: '2px', zIndex: 10, boxShadow: `0 0 4px -2px ${dropIndicatorColor}`}}/>
                )}
            </div>
        );
    }

    return (
        <div style={{position: 'relative'}}>
            {isDraggingGroup && isDropTargetGroup && dropPositionGroup === 'before' && (
                <div style={{position: 'absolute', top: '-4px', left: '0', right: '0', height: '3px', backgroundColor: dropIndicatorColor, borderRadius: '2px', zIndex: 10, boxShadow: `0 0 4px -2px ${dropIndicatorColor}`}}/>
            )}
            <div draggable={!!group} onDragStart={handleGroupDragStart} onDragEnd={handleGroupDragEnd}
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
                     marginBottom: '0px', minHeight: showDropZone ? '80px' : 'auto',
                     backgroundColor: isDragOver ? dropZoneBg : (showDropZone ? adjustOpacity(centerChannelColor, centerChannelBg, 0.02) : 'transparent'),
                     border: isDraggingThis ? `2px dashed ${buttonBg}` : (isDragOver ? `2px dashed ${buttonBg}` : (showDropZone ? `2px dashed ${borderColor}` : 'none')),
                     borderRadius: '8px', paddingTop: '8px', paddingBottom: '4px', transition: 'all 0.3s ease', position: 'relative',
                     opacity: isDraggingThis ? 0.4 : groupOpacity, cursor: group ? 'grab' : 'default'
                 }}>
                {renderHeader()}
                {showDropZone && (
                    <div style={{padding: '24px', textAlign: 'center', color: isDragOver ? buttonBg : subtleText, fontSize: '13px', fontStyle: 'italic', fontWeight: isDragOver ? 600 : 400}}>
                        {isDragOver ? `Drop to move to ${title}` : `Drag items here to move to ${title}`}
                    </div>
                )}
                {/* Outer wrapper handles height animation with overflow:hidden only when needed */}
                <div style={{
                    height: isCollapsed ? '0px' : `${contentHeight}px`,
                    overflow: shouldClipOverflow ? 'hidden' : 'visible',
                    transition: 'height 0.3s ease'
                }}>
                    {/* Inner content wrapper maintains natural height for measurement */}
                    <div
                        ref={contentRef}
                        style={{
                            opacity: isCollapsed ? 0 : 1,
                            transition: 'opacity 0.3s ease'
                        }}
                    >
                        {tasks.map(task => (
                            <TaskItemComponent key={task.id} task={task} channelMembers={channelMembers} onToggle={onToggle} onDelete={onDelete}
                                               onToggleAssignee={onToggleAssignee} onUpdateText={onUpdateText} onDragStart={onDragStart} onDragEnd={onDragEnd}
                                               onDragOverTask={onDragOverTask} onDragLeaveTask={onDragLeaveTask} onDropOnTask={onDropOnTask}
                                               isDraggingItem={isDragging} isDropTarget={dragOverTaskId === task.id}
                                               dropPosition={dragOverTaskId === task.id ? dragOverPosition : null} theme={theme} showNotes={showNotes} hideAssignees={hideAssignees}/>
                        ))}
                    </div>
                </div>
            </div>
            {isDraggingGroup && isDropTargetGroup && dropPositionGroup === 'after' && (
                <div style={{position: 'absolute', bottom: '-4px', left: '0', right: '0', height: '3px', backgroundColor: dropIndicatorColor, borderRadius: '2px', zIndex: 10, boxShadow: `0 0 4px -2px ${dropIndicatorColor}`}}/>
            )}
        </div>
    );
};