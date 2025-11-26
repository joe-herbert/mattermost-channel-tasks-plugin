export interface TaskItem {
    id: string;
    text: string;
    notes?: string;
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
    has_ever_had_tasks: boolean;
}

export interface PrivateTaskList {
    items: TaskItem[];
    groups: TaskGroup[];
    has_ever_had_tasks: boolean;
}