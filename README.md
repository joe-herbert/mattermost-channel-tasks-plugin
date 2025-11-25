# Mattermost Channel Tasks Plugin

A Mattermost plugin that adds a comprehensive task list feature to each channel with grouping, assignment, filtering, and drag-and-drop reordering capabilities.

This plugin differs from other todo plugins by having a task list specific to each channel, meaning if you have a channel for a project or group, they can have their own task list.

## Features

- **Channel-Specific Task Lists**: Each channel has its own independent task list with dynamic titles
- **App Bar Button**: Quick access button in the App Bar with a checkmark icon
- **Right-Hand Sidebar**: Full-featured task list interface that opens in the right sidebar
- **Task Management**: Add, complete, edit, and delete task items with inline editing
- **Grouping**: Organize tasks into custom groups with drag-and-drop reordering
- **Multi-Assignment**: Assign multiple channel members to tasks
- **Filtering**: Filter tasks by completion status and assignee (all tasks, assigned to me)
- **Drag-and-Drop**: Reorder tasks and groups, or move tasks between groups
- **Click-to-Complete**: Click anywhere on a task to toggle completion
- **Persistent Filters**: Filter preferences persist across sessions
- **Persistent Storage**: All tasks are stored in Mattermost's key-value store

## Project Structure

```
mattermost-channel-tasks-plugin/
├── plugin/
│   ├── plugin.json              # Plugin manifest
│   ├── makefile                 # Build configuration
│   ├── server/
│   │   └── plugin.go           # Backend Go code
│   └── webapp/
│       ├── package.json        # NPM dependencies
│       ├── webpack.config.js   # Webpack configuration
│       └── src/
│           └── index.tsx       # Frontend React components
├── docker-compose.yml           # Local development setup
└── environment-setup-guide.md   # Development environment guide
```

## Installation

1. Build the plugin:
   ```bash
   cd plugin
   make
   ```

2. Upload the generated `.tar.gz` file from `plugin/dist/` to your Mattermost server:
    - Go to **System Console** > **Plugins** > **Management**
    - Click **Upload Plugin**
    - Select the plugin file

3. Enable the plugin:
    - Click **Enable** next to the plugin name

## Usage

### Accessing the Task List

1. In any channel, look for the checkmark (✓) icon in the App Bar
2. Click the icon to open the task sidebar on the right
3. Alternatively, click the "Task List" option in the channel header menu

### Adding Tasks

1. Click "**+ Add Task**" button to show the task form
2. Type your task text in the input field
3. Optionally select a group from the dropdown
4. Click "**Add Task**" or press **Enter**

### Managing Tasks

- **Complete/Uncomplete**: Click the checkbox or click anywhere on the task background
- **Edit Task**: Click on the task text to edit it inline (unavailable for completed tasks)
- **Assign Members**: Click the avatar icon to open the assignee menu, then click members to toggle assignment (supports multiple assignees)
- **Reorder Tasks**: Drag and drop tasks within a group or between groups
- **Delete**: Click the × button to remove a task

### Creating Groups

1. Click "**+ Add Group**" button
2. Enter a group name
3. Click "**Create Group**"
4. When adding new tasks, select the group from the dropdown

### Managing Groups

- **Edit Group Name**: Click on the group name to edit it inline
- **Reorder Groups**: Drag and drop groups to reorder them
- **Delete Group**: Click the "×" button next to the group name
  - Deletes all tasks in the group (shows warning on first delete)
  - Can disable the warning by checking "Don't warn me again"

### Filtering Tasks

1. Click "**+ Filters**" button to show filter options
2. **Assignee Filter**: Choose "All" or "Assigned to me"
3. **Completion Filter**: Choose "All", "Complete", or "Incomplete"
4. Filter settings persist across sessions

## Development

### Prerequisites

- Go 1.16+
- Node.js 14+
- npm
- Mattermost Server 5.20+

### Local Development Setup

For local development with Docker, see the `environment-setup-guide.md` file.

### Building

```bash
# Navigate to plugin directory
cd plugin

# Install webapp dependencies
cd webapp
npm install

# Build the plugin from plugin directory
cd ..
make
```

The built plugin will be available at `plugin/dist/com.mattermost.channel-task-[version].tar.gz`

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
  "assignee_ids": ["user_id_1", "user_id_2"],
  "group_id": "group_id",
  "created_at": "2025-01-01T00:00:00Z"  // Used for ordering
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

#### Update Group
```
PUT /plugins/com.mattermost.channel-task/api/v1/groups?channel_id={channelId}
Body: {
  "id": "group_id",
  "name": "Updated name",
  "order": "ordering_string"  // Used for custom group ordering
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
  assignee_ids?: string[];      // Array of user IDs assigned to the task
  group_id?: string;
  created_at: string;           // ISO timestamp, also used for task ordering
  completed_at?: string;
}
```

### TaskGroup
```typescript
{
  id: string;
  name: string;
  order?: string;               // Custom ordering string for group position
}
```

### ChannelTaskList
```typescript
{
  items: TaskItem[];
  groups: TaskGroup[];
}
```

## Storage

All data is stored in Mattermost's built-in key-value store with keys in the format:
```
tasks_{channelId}
```

Each key contains a JSON object with the complete task list and groups for that channel. Filter preferences are stored in browser `localStorage` with the key `mattermost-task-filters`.

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT License
