import React from 'react';
import {TaskSidebar} from './components/TaskSidebar';
import {adjustOpacity} from "./utils";

const PRIVATE_MODE_STORAGE_KEY = 'mattermost-task-private-mode';

export default class Plugin {
    private store: any = null;
    private toggleRHSPlugin: any = null;
    private channelChangeCallbacks: Array<() => void> = [];
    private unsubscribeStore: (() => void) | null = null;
    private lastChannelId: string | null = null;
    private showPrivate: boolean = false;
    private forceUpdateCallbacks: Array<() => void> = [];

    public initialize(registry: any, store: any) {
        this.store = store;

        // Load saved private mode preference
        try {
            const saved = localStorage.getItem(PRIVATE_MODE_STORAGE_KEY);
            if (saved !== null) {
                this.showPrivate = saved === 'true';
            }
        } catch (e) {
            console.error('Error loading private mode preference:', e);
        }

        this.unsubscribeStore = store.subscribe(() => {
            const state = store.getState();
            const currentChannelId = state?.entities?.channels?.currentChannelId;
            if (currentChannelId && currentChannelId !== this.lastChannelId) {
                this.lastChannelId = currentChannelId;
                this.reportActivity();
                this.channelChangeCallbacks.forEach(callback => callback());
            }
        });

        this.reportActivity();

        const pluginInstance = this;

        const DynamicTitle = () => {
            const [title, setTitle] = React.useState(pluginInstance.showPrivate ? 'Private Tasks' : 'Channel Tasks');
            const [showPrivate, setShowPrivate] = React.useState(pluginInstance.showPrivate);

            const centerChannelBg = '#ffffff';
            const centerChannelColor = '#333333';
            const buttonBg = '#1c58d9';
            const subtleBackground = adjustOpacity(centerChannelColor, centerChannelBg, 0.05);

            // Subscribe to private mode changes
            React.useEffect(() => {
                const callback = () => setShowPrivate(pluginInstance.showPrivate);
                pluginInstance.forceUpdateCallbacks.push(callback);
                return () => {
                    pluginInstance.forceUpdateCallbacks = pluginInstance.forceUpdateCallbacks.filter(cb => cb !== callback);
                };
            }, []);

            React.useEffect(() => {
                let lastChannelId: string | null = null;

                const updateTitle = async () => {
                    if (showPrivate) {
                        setTitle('Private Tasks');
                        return;
                    }

                    const state = store.getState();
                    const currentChannelId = state?.entities?.channels?.currentChannelId;

                    if (currentChannelId && currentChannelId !== lastChannelId) {
                        lastChannelId = currentChannelId;
                        const channels = state?.entities?.channels?.channels;

                        if (channels && channels[currentChannelId]) {
                            const channel = channels[currentChannelId];

                            if (channel.type === 'D') {
                                const currentUserId = state?.entities?.users?.currentUserId;
                                const otherUserId = channel.name.split('__').find((id: string) => id !== currentUserId);
                                if (otherUserId) {
                                    const users = state?.entities?.users?.profiles;
                                    const otherUser = users?.[otherUserId];
                                    if (otherUser) {
                                        const displayName = otherUser.nickname || `${otherUser.first_name || ''} ${otherUser.last_name || ''}`.trim() || otherUser.username;
                                        setTitle(`${displayName} Tasks`);
                                    } else {
                                        try {
                                            const response = await fetch(`/api/v4/users/${otherUserId}`);
                                            if (response.ok) {
                                                const user = await response.json();
                                                const displayName = user.nickname || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
                                                setTitle(`${displayName} Tasks`);
                                            } else {
                                                setTitle('Chat Tasks');
                                            }
                                        } catch {
                                            setTitle('Chat Tasks');
                                        }
                                    }
                                } else {
                                    setTitle('Chat Tasks');
                                }
                            } else if (channel.type === 'G') {
                                if (channel.display_name && channel.display_name.trim()) {
                                    setTitle(`${channel.display_name} Tasks`);
                                } else {
                                    setTitle('Group Chat Tasks');
                                }
                            } else {
                                const channelName = channel.display_name || channel.name;
                                if (channelName && !channelName.includes('__')) {
                                    setTitle(`${channelName} Tasks`);
                                } else {
                                    setTitle('Channel Tasks');
                                }
                            }
                        }
                    }
                };

                updateTitle();
                const unsubscribe = store.subscribe(updateTitle);
                return () => unsubscribe();
            }, [showPrivate]);

            return (
                <span>{title}</span>
            );
        };

        const TaskSidebarWrapper = (props: any) => {
            const [privateMode, setPrivateMode] = React.useState(pluginInstance.showPrivate);

            React.useEffect(() => {
                const callback = () => setPrivateMode(pluginInstance.showPrivate);
                pluginInstance.forceUpdateCallbacks.push(callback);
                return () => {
                    pluginInstance.forceUpdateCallbacks = pluginInstance.forceUpdateCallbacks.filter(cb => cb !== callback);
                };
            }, []);

            const onChannelChange = (callback: () => void) => {
                pluginInstance.channelChangeCallbacks.push(callback);
            };

            const handleTogglePrivate = () => {
                pluginInstance.showPrivate = !pluginInstance.showPrivate;
                try {
                    localStorage.setItem(PRIVATE_MODE_STORAGE_KEY, String(pluginInstance.showPrivate));
                } catch (e) {
                    console.error('Error saving private mode preference:', e);
                }
                pluginInstance.forceUpdateCallbacks.forEach(cb => cb());
            };

            return <TaskSidebar {...props} onChannelChange={onChannelChange} privateTasks={privateMode} onTogglePrivate={handleTogglePrivate}/>;
        };

        const {toggleRHSPlugin} = registry.registerRightHandSidebarComponent(TaskSidebarWrapper, DynamicTitle);
        this.toggleRHSPlugin = toggleRHSPlugin;

        registry.registerChannelHeaderButtonAction(
            () => <i className="icon icon-check" style={{fontSize: '18px'}}/>,
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
            () => <i className="icon icon-check"/>
        );
    }

    private reportActivity = async () => {
        try {
            await fetch('/plugins/com.mattermost.channel-task/api/v1/activity', {method: 'POST'});
        } catch (error) {
            console.error('Error reporting activity:', error);
        }
    };

    public uninitialize() {
        if (this.unsubscribeStore) this.unsubscribeStore();
        this.channelChangeCallbacks = [];
    }
}

(window as any).registerPlugin('com.mattermost.channel-task', new Plugin());
