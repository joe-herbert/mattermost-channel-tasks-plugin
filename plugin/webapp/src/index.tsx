import React from 'react';
import {TaskSidebar} from './components/TaskSidebar';

export default class Plugin {
    private store: any = null;
    private toggleRHSPlugin: any = null;
    private channelChangeCallbacks: Array<() => void> = [];
    private unsubscribeStore: (() => void) | null = null;
    private lastChannelId: string | null = null;
    private activityReported: boolean = false;

    public initialize(registry: any, store: any) {
        this.store = store;

        // Subscribe to store changes to detect channel switches
        this.unsubscribeStore = store.subscribe(() => {
            const state = store.getState();
            const currentChannelId = state?.entities?.channels?.currentChannelId;

            if (currentChannelId && currentChannelId !== this.lastChannelId) {
                this.lastChannelId = currentChannelId;

                // Report activity on channel change
                this.reportActivity();

                // Notify all registered callbacks that channel changed
                this.channelChangeCallbacks.forEach(callback => callback());
            }
        });

        // Report activity on initial load
        this.reportActivity();

        // Create a title component that updates when channel changes
        const DynamicTitle = () => {
            const [title, setTitle] = React.useState('Channel Tasks');

            React.useEffect(() => {
                let lastChannelId: string | null = null;

                const updateTitle = async () => {
                    const state = store.getState();
                    const currentChannelId = state?.entities?.channels?.currentChannelId;

                    if (currentChannelId && currentChannelId !== lastChannelId) {
                        lastChannelId = currentChannelId;
                        const channels = state?.entities?.channels?.channels;

                        if (channels && channels[currentChannelId]) {
                            const channel = channels[currentChannelId];

                            // Check if it's a DM or GM channel
                            // Channel types: 'O' = public, 'P' = private, 'D' = DM, 'G' = GM
                            if (channel.type === 'D') {
                                // Direct message - get the other user's name
                                const currentUserId = state?.entities?.users?.currentUserId;
                                const otherUserId = channel.name
                                    .split('__')
                                    .find((id: string) => id !== currentUserId);

                                if (otherUserId) {
                                    const users = state?.entities?.users?.profiles;
                                    const otherUser = users?.[otherUserId];

                                    if (otherUser) {
                                        const displayName = otherUser.nickname ||
                                            `${otherUser.first_name || ''} ${otherUser.last_name || ''}`.trim() ||
                                            otherUser.username;
                                        setTitle(`${displayName} Tasks`);
                                    } else {
                                        // User not in cache, try to fetch
                                        try {
                                            const response = await fetch(`/api/v4/users/${otherUserId}`);
                                            if (response.ok) {
                                                const user = await response.json();
                                                const displayName = user.nickname ||
                                                    `${user.first_name || ''} ${user.last_name || ''}`.trim() ||
                                                    user.username;
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
                                // Group message - use display_name or fallback
                                if (channel.display_name && channel.display_name.trim()) {
                                    setTitle(`${channel.display_name} Tasks`);
                                } else {
                                    setTitle('Group Chat Tasks');
                                }
                            } else {
                                // Regular channel
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

            return <TaskSidebar {...props} onChannelChange={onChannelChange}/>;
        };

        const {toggleRHSPlugin} = registry.registerRightHandSidebarComponent(
            TaskSidebarWrapper,
            DynamicTitle
        );

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
        // Only report once per session to avoid spamming
        // The server will handle the "once per day" logic
        try {
            await fetch('/plugins/com.mattermost.channel-task/api/v1/activity', {
                method: 'POST'
            });
        } catch (error) {
            console.error('Error reporting activity:', error);
        }
    };

    public uninitialize() {
        if (this.unsubscribeStore) {
            this.unsubscribeStore();
        }
        this.channelChangeCallbacks = [];
    }
}

(window as any).registerPlugin('com.mattermost.channel-task', new Plugin());
