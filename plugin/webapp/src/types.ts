export interface TaskItem {
    id: string;
    text: string;
    completed: boolean;
    assignee_ids?: string[];
    group_id?: string;
    created_at: string;
    completed_at?: string;
    deadline?: string;
}

export interface TaskGroup {
    id: string;
    name: string;
    order?: string;
}

export interface ChannelTaskList {
    items: TaskItem[];
    groups: TaskGroup[];
}
