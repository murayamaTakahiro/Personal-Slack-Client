import { writable, get } from 'svelte/store';

interface User {
  id: string;
  name: string;
  realName: string | null;
}

// Store for all users in the workspace
const users = writable<User[]>([]);

// Map for quick user lookup by ID
const userMap = writable<Map<string, User>>(new Map());

// Store instance
export const userStore = {
  subscribe: users.subscribe,
  
  // Initialize users for the workspace
  initUsers: async (userList: [string, string, string | null][]) => {
    const formattedUsers: User[] = userList.map(([id, name, realName]) => ({
      id,
      name,
      realName
    }));
    
    users.set(formattedUsers);
    
    // Build user map for quick lookup
    const map = new Map<string, User>();
    formattedUsers.forEach(user => {
      map.set(user.id, user);
    });
    userMap.set(map);
    
    console.log(`Initialized ${formattedUsers.length} users`);
  },
  
  // Get user by ID
  getUserById: (userId: string): User | undefined => {
    const map = get(userMap);
    return map.get(userId);
  },
  
  // Get username by ID (returns ID if not found)
  getUsernameById: (userId: string): string => {
    const user = userStore.getUserById(userId);
    return user ? user.name : userId;
  },
  
  // Clear all users
  clear: () => {
    users.set([]);
    userMap.set(new Map());
  },
  
  // Replace user mentions in text
  replaceMentions: (text: string): string => {
    const map = get(userMap);
    
    // Replace user mentions like <@U03MVLD5S> with @username
    return text.replace(/<@(U[A-Z0-9]+)>/g, (match, userId) => {
      const user = map.get(userId);
      return user ? `@${user.name}` : match;
    });
  }
};

export default userStore;