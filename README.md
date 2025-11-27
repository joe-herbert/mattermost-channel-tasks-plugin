# Mattermost Channel Tasks Plugin

A Mattermost plugin that adds a comprehensive task list feature to each channel with grouping, assignment, filtering, deadlines, and drag-and-drop reordering capabilities.

This plugin differs from other todo plugins by having a task list specific to each channel, meaning if you have a channel for a project or group, they can have their own task list. It also includes private tasks for personal use.

## Features

### Task Management
- **Channel-Specific Task Lists**: Each channel has its own independent task list with dynamic titles
- **Private Tasks**: Personal task list not tied to any channel, accessible via the sidebar toggle
- **Task Notes**: Add detailed notes to any task for additional context
- **Deadlines**: Set due dates for tasks with color-coded indicators:
    - 🟥 Red border: Overdue
    - 🟧 Orange border: Due today
    - 🟨 Yellow border: Due within one week
- **Click-to-Complete**: Click anywhere on a task to toggle completion
- **Inline Editing**: Click on task text to edit it directly
- **Multi-Assignment**: Assign multiple channel members to tasks (channel tasks only)

### Organization
- **Grouping**: Organize tasks into custom groups
- **Collapsible Groups**: Click group headers to collapse/expand task groups
- **Drag-and-Drop**: Reorder tasks and groups, or move tasks between groups
- **Filtering**: Filter tasks by:
    - Completion status (All, Complete, Incomplete)
    - Assignee (All tasks, Assigned to me)
    - Deadline (All, Due Today, Due Within 1 Week, Past Due, Custom Range)

### Daily Reminders
- **Automatic Task Summary**: Receive a daily summary of your assigned tasks when you first log in
- **Categorized by Urgency**: Tasks are grouped by overdue, due today, due within a week, and others
- **Configurable**: Enable/disable reminders with slash commands

### Interface
- **App Bar Button**: Quick access button with a checkmark icon
- **Right-Hand Sidebar**: Full-featured task interface in the sidebar
- **Channel Header Menu**: Alternative access via the channel header menu
- **Celebration Animation**: Confetti animation when all tasks are completed
- **Delete Completed**: Bulk delete all completed tasks with one click

### Slash Commands

#### Daily Reminder Commands
| Command | Description |
|---------|-------------|
| `/tasks-message-on` | Enable daily task reminders |
| `/tasks-message-off` | Disable daily task reminders |
| `/tasks-message-reset` | Reset daily reminder (receive a new summary immediately) |

#### Channel Task Commands
| Command | Alias | Description |
|---------|-------|-------------|
| `/tasks` | `/t` | Show all tasks in this channel |
| `/tasks-mine` | `/tmine` | Show tasks assigned to me |
| `/tasks-todo` | `/ttodo` | Show prioritized tasks to focus on next |
| `/tasks-today` | | Show tasks due today |
| `/tasks-overdue` | | Show overdue tasks |
| `/tasks-incomplete` | | Show incomplete tasks |
| `/tasks-complete` | | Show completed tasks |

#### Private Task Commands
| Command | Alias | Description |
|---------|-------|-------------|
| `/tasks-private` | `/tp` | Show all private tasks |
| `/tasks-private-todo` | `/tptodo` | Show prioritized private tasks |
| `/tasks-private-today` | | Show private tasks due today |
| `/tasks-private-overdue` | | Show overdue private tasks |
| `/tasks-private-incomplete` | | Show incomplete private tasks |
| `/tasks-private-complete` | | Show completed private tasks |

## Project Structure
```
mattermost-channel-tasks-plugin/
├── plugin/
│   ├── plugin.json              # Plugin manifest
│   ├── makefile                 # Build configuration
│   ├── server/
│   │   ├── plugin.go            # Backend Go code
│   │   └── icon.go              # Bot icon data
│   └── webapp/
│       ├── package.json         # NPM dependencies
│       ├── webpack.config.js    # Webpack configuration
│       └── src/
│           ├── index.tsx        # Plugin initialization
│           ├── types.ts         # TypeScript interfaces
│           ├── utils.ts         # Utility functions
│           └── components/
│               ├── TaskSidebar.tsx        # Main sidebar component
│               ├── TaskGroupSection.tsx   # Group component
│               ├── TaskItemComponent.tsx  # Individual task component
│               ├── TaskItemNotes.tsx      # Notes panel component
│               ├── DeleteGroupWarning.tsx # Group deletion dialog
│               └── DeleteCompletedWarning.tsx # Bulk delete dialog
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

### Switching Between Channel and Private Tasks

- Click the "Show Private" / "Show Channel" button in the sidebar header to toggle between modes
- Your preference is saved and persists across sessions

### Adding Tasks

1. Click "**+ Add Task**" button to show the task form
2. Type your task text in the input field
3. Optionally select a group from the dropdown
4. Optionally set a deadline using the date picker
5. Click "**Add Task**" or press **Enter**

### Managing Tasks

- **Complete/Uncomplete**: Click the checkbox or click anywhere on the task background
- **Edit Task**: Click on the task text to edit it inline (unavailable for completed tasks)
- **Add Notes**: Click the ⋮ menu and select "Notes" to add detailed notes
- **Set Deadline**: Click the ⋮ menu and select "Set Deadline", or click an existing deadline to edit
- **Assign Members**: Click the ⋮ menu and select "Assign", or click existing avatars (channel tasks only)
- **Reorder Tasks**: Drag and drop tasks within a group or between groups
- **Delete**: Click the ⋮ menu and select "Delete Task"

### Creating Groups

1. Click "**+ Add Group**" button
2. Enter a group name
3. Click "**Create Group**"
4. When adding new tasks, select the group from the dropdown

### Managing Groups

- **Collapse/Expand**: Click on the group header to toggle visibility
- **Edit Group Name**: Click on the group name text to edit it inline
- **Reorder Groups**: Drag and drop groups to reorder them
- **Delete Group**: Click the "Delete Group" button that appears on hover
    - Deletes all tasks in the group (shows warning on first delete)
    - Can disable the warning by checking "Don't warn me again"

### Bulk Delete Completed Tasks

- When there are completed tasks, a red button appears in the bottom-right corner
- Click it to delete all completed tasks at once
- A confirmation dialog appears (can be disabled)

### Filtering Tasks

1. Click "**+ Filters**" button to show filter options
2. **Assignee Filter**: Choose "All" or "Assigned to me" (channel tasks only)
3. **Completion Filter**: Choose "All", "Complete", or "Incomplete"
4. **Deadline Filter**: Choose "All", "Due Today", "Due Within 1 Week", "Past Due", or "Custom Deadline Range"
5. Filter settings persist across sessions

### Daily Task Reminders

The plugin automatically sends you a daily summary of your tasks when you first become active each day. The summary includes:

- ✅ Tasks completed yesterday
- 🟥 Overdue tasks
- 🟧 Tasks due today
- 🟨 Tasks due within the week
- ⬜ Other assigned tasks

Use `/tasks-message-off` to disable these reminders or `/tasks-message-on` to re-enable them.

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

The plugin exposes REST API endpoints for both channel and private tasks:

#### Channel Tasks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/tasks?channel_id={id}` | Get all tasks for a channel |
| POST | `/api/v1/tasks?channel_id={id}` | Create a new task |
| PUT | `/api/v1/tasks?channel_id={id}` | Update a task |
| DELETE | `/api/v1/tasks?channel_id={id}&id={taskId}` | Delete a task |
| POST | `/api/v1/groups?channel_id={id}` | Create a group |
| PUT | `/api/v1/groups?channel_id={id}` | Update a group |
| DELETE | `/api/v1/groups?channel_id={id}&id={groupId}` | Delete a group |

#### Private Tasks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/private/tasks?user_id={id}` | Get all private tasks |
| POST | `/api/v1/private/tasks?user_id={id}` | Create a private task |
| PUT | `/api/v1/private/tasks?user_id={id}` | Update a private task |
| DELETE | `/api/v1/private/tasks?user_id={id}&id={taskId}` | Delete a private task |
| POST | `/api/v1/private/groups?user_id={id}` | Create a private group |
| PUT | `/api/v1/private/groups?user_id={id}` | Update a private group |
| DELETE | `/api/v1/private/groups?user_id={id}&id={groupId}` | Delete a private group |

#### Other Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/activity` | Report user activity (triggers daily reminder check) |

## Data Structure

### TaskItem
```typescript
{
  id: string;
  text: string;
  notes?: string;               // Optional task notes
  completed: boolean;
  assignee_ids?: string[];      // Array of user IDs (channel tasks only)
  group_id?: string;
  created_at: string;           // ISO timestamp, also used for ordering
  completed_at?: string;
  deadline?: string;            // ISO timestamp for due date
}
```

### TaskGroup
```typescript
{
  id: string;
  name: string;
  order?: string;               // Custom ordering string
}
```

### ChannelTaskList / PrivateTaskList
```typescript
{
  items: TaskItem[];
  groups: TaskGroup[];
  has_ever_had_tasks: boolean;  // Used for celebration animation
}
```

## Storage

All data is stored in Mattermost's built-in key-value store:

| Key Pattern | Description |
|-------------|-------------|
| `tasks_{channelId}` | Channel task list and groups |
| `private_tasks_{userId}` | Private task list and groups |
| `daily_prefs_{userId}` | Daily reminder preferences |

Browser `localStorage` is used for:
- `mattermost-task-filters` - Filter preferences
- `mattermost-task-private-mode` - Private/channel mode toggle
- `mattermost-task-dont-warn-delete-group` - Delete group warning preference
- `mattermost-task-dont-warn-delete-completed` - Delete completed warning preference

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT License
