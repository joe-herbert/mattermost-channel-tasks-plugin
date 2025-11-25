import React from 'react';
import { TaskSidebar } from './components/TaskSidebar';

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

(window as any).registerPlugin('com.mattermost.channel-task', new Plugin());
