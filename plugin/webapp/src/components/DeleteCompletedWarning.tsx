import React from 'react';
import {adjustOpacity} from '../utils';

interface DeleteCompletedWarningProps {
    taskCount: number;
    onConfirm: (dontWarnAgain: boolean) => void;
    onCancel: () => void;
    theme: any;
}

export const DeleteCompletedWarning: React.FC<DeleteCompletedWarningProps> = ({taskCount, onConfirm, onCancel, theme}) => {
    const [dontWarnAgain, setDontWarnAgain] = React.useState(false);

    const centerChannelBg = theme?.centerChannelBg || '#ffffff';
    const centerChannelColor = theme?.centerChannelColor || '#333333';
    const errorTextColor = theme?.errorTextColor || '#dc3545';

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
                    Delete Completed Tasks?
                </h3>
                <p style={{
                    margin: '0 0 20px 0',
                    fontSize: '14px',
                    lineHeight: '1.5',
                    color: centerChannelColor
                }}>
                    This will permanently delete <strong>{taskCount}</strong> completed task{taskCount !== 1 ? 's' : ''}. This action cannot be undone.
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
                        Delete Completed
                    </button>
                </div>
            </div>
        </div>
    );
};
