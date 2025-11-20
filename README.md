# Mattermost Channel Task List Plugin

A Mattermost plugin that adds a comprehensive task list feature to each channel with grouping and assignment capabilities.

## Features

- **Channel-Specific Task Lists**: Each channel has its own independent task list
- **Header Button**: Quick access button in the channel header showing the count of incomplete tasks
- **Right-Hand Sidebar**: Full-featured task list interface that opens in the right sidebar
- **Task Management**: Add, complete, and delete task items
- **Grouping**: Organize tasks into custom groups
- **Assignment**: Assign tasks to channel members
- **Persistent Storage**: All tasks are stored in Mattermost's key-value store

## Project Structure

```
mattermost-channel-task/
├── plugin.json              # Plugin manifest
├── server/
│   └── plugin.go           # Backend Go code
└── webapp/
    └── index.tsx           # Frontend React components
```

## Installation

1. Build the plugin:
   ```bash
   make
   ```

2. Upload the generated `.tar.gz` file to your Mattermost server:
    - Go to **System Console** > **Plugins** > **Management**
    - Click **Upload Plugin**
    - Select the plugin file

3. Enable the plugin:
    - Click **Enable** next to the plugin name

## Usage

### Accessing the Task List

1. In any channel, look for the checkmark (✓) icon with a number in the channel header
2. Click the icon to open the task sidebar on the right

### Adding Tasks

1. Type your task text in the input field
2. Optionally select a group from the dropdown
3. Click "Add Task" or press Enter

### Managing Tasks

- **Complete/Uncomplete**: Click the checkbox next to any task
- **Assign**: Select a channel member from the dropdown next to each task
- **Delete**: Click the × button to remove a task

### Creating Groups

1. Click "Add Group" button
2. Enter a group name
3. Click "Create Group"
4. When adding new tasks, select the group from the dropdown

### Deleting Groups

- Click "Delete Group" button next to the group name
- All tasks in that group will be moved to "Ungrouped"

## Development

### Prerequisites

- Go 1.16+
- Node.js 14+
- Mattermost Server 5.20+

### Building

```bash
# Install dependencies
cd webapp
npm install

# Build the plugin
cd ..
make
```

### API Endpoints

The plugin exposes the following REST API endpoints:

#### Get Tasks
```
GET /plugins/com.mattermost.channel-task/api/v1/tasks?channel_id={channelId}
```

#### Create Task
```
POST /plugins/com.mattermost.channel-task/api/v1/tasks?channel_id={channelId}
Body: {
  "text": "Task text",
  "group_id": "optional_group_id"
}
```

#### Update Task
```
PUT /plugins/com.mattermost.channel-task/api/v1/tasks?channel_id={channelId}
Body: {
  "id": "task_id",
  "text": "Updated text",
  "completed": true,
  "assignee_id": "user_id",
  "group_id": "group_id"
}
```

#### Delete Task
```
DELETE /plugins/com.mattermost.channel-task/api/v1/tasks?channel_id={channelId}&id={taskId}
```

#### Create Group
```
POST /plugins/com.mattermost.channel-task/api/v1/groups?channel_id={channelId}
Body: {
  "name": "Group name"
}
```

#### Delete Group
```
DELETE /plugins/com.mattermost.channel-task/api/v1/groups?channel_id={channelId}&id={groupId}
```

## Data Structure

### TaskItem
```typescript
{
  id: string;
  text: string;
  completed: boolean;
  assignee_id?: string;
  group_id?: string;
  created_at: string;
  completed_at?: string;
}
```

### TaskGroup
```typescript
{
  id: string;
  name: string;
}
```

## Storage

All data is stored in Mattermost's built-in key-value store with keys in the format:
```
tasks_{channelId}
```

Each key contains a JSON object with the complete task list and groups for that channel.

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT License