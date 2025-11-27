import {TaskItem} from "../types";
import React from "react";

interface TaskItemNotesProps {
    task: TaskItem;
    hideTaskNotes: () => void;
    updateTaskNotes: (task: TaskItem, notes: string) => void;
    bg: string;
    subtleBackground: string;
    buttonBg: string;
    buttonColor: string;
    borderColor: string;
    shadowColor: string;
    channelBg: string;
}

export const TaskItemNotes: React.FC<TaskItemNotesProps> = ({task, hideTaskNotes, updateTaskNotes, bg, subtleBackground, buttonBg, buttonColor, borderColor, shadowColor, channelBg}) => {
    const [editing, setEditing] = React.useState(!task.notes);
    const [notes, setNotes] = React.useState(task.notes || '');

    React.useEffect(() => {
        setEditing(false);
        setNotes(task.notes || '');
    }, [task]);

    const startEdit = () => {
        setEditing(true);
        setTimeout(() => {
            const textarea = document.getElementById('notesTextarea');
            if (textarea) textarea.focus();
        }, 0);
    };

    const cancelEdit = () => {
        setEditing(false);
        setNotes(task.notes || '');
    };

    const saveEdit = () => {
        setEditing(false);
        updateTaskNotes(task, notes);
        task.notes = notes;
    }

    return (
        <div style={{
            width: '100%',
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            boxShadow: `0 -2px 4px ${shadowColor}`,
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
            justifyItems: 'start',
            gap: '12px',
            zIndex: 500,
            backgroundColor: bg,
            maxHeight: '700px',
        }}>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: "8px"
            }}>
                <span style={{fontWeight: "bold"}}>{task.text}</span>
                <div style={{display: 'flex', gap: '8px'}}>
                    {editing ?
                        <div style={{display: 'flex', gap: '8px'}}>
                            <button onClick={cancelEdit} style={{
                                flex: 1,
                                padding: '8px 12px',
                                fontSize: '14px',
                                fontWeight: 500,
                                backgroundColor: subtleBackground,
                                color: buttonColor,
                                border: `1px solid ${borderColor}`,
                                borderRadius: '4px',
                                cursor: 'pointer'
                            }}>Cancel
                            </button>
                            <button onClick={saveEdit} style={{
                                flex: 1,
                                padding: '8px 12px',
                                fontSize: '14px',
                                fontWeight: 500,
                                backgroundColor: buttonBg,
                                color: 'white',
                                border: `1px solid ${borderColor}`,
                                borderRadius: '4px',
                                cursor: 'pointer'
                            }}>Save
                            </button>
                        </div>
                        :
                        <button onClick={startEdit} style={{
                            flex: 1,
                            padding: '8px 12px',
                            fontSize: '14px',
                            fontWeight: 500,
                            backgroundColor: buttonBg,
                            color: 'white',
                            border: `1px solid ${borderColor}`,
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}>Edit</button>
                    }
                    <button onClick={hideTaskNotes} style={{
                        flex: 1,
                        padding: '8px 12px',
                        fontSize: '14px',
                        fontWeight: 500,
                        backgroundColor: subtleBackground,
                        color: buttonColor,
                        border: `1px solid ${borderColor}`,
                        borderRadius: '4px',
                        cursor: 'pointer'
                    }}>Close
                    </button>
                </div>
            </div>
            {editing ?
                <textarea id="notesTextarea" placeholder="Enter some notes here..." value={notes} onChange={e => setNotes(e.target.value)} style={{border: `1px solid ${borderColor}`, borderRadius: "5px", font: "inherit", padding: "6px", resize: "vertical", maxHeight: "600px", minHeight: "100px", backgroundColor: channelBg}}></textarea>
                :
                <pre style={{border: `1px solid ${borderColor}`, borderRadius: "5px", font: "inherit", padding: "6px", margin: "0px", minHeight: "100px", backgroundColor: subtleBackground}}>{notes}</pre>
            }
        </div>
    )
}
