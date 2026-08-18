'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Users, 
  MessageSquare, 
  FileText, 
  Activity
} from 'lucide-react';

const recentActivities = [
  {
    id: 1,
    title: 'New user registered',
    description: 'john.doe@example.com joined the platform',
    time: '2 minutes ago',
    type: 'user',
  },
  {
    id: 2,
    title: 'Form submitted',
    description: 'Contact form from contact@company.com',
    time: '15 minutes ago',
    type: 'form',
  },
  {
    id: 3,
    title: 'Chat message received',
    description: 'New message in support channel',
    time: '1 hour ago',
    type: 'chat',
  },
  {
    id: 4,
    title: 'System update',
    description: 'Database maintenance completed',
    time: '2 hours ago',
    type: 'system',
  },
];

export default function RecentActivity() {
  const getActivityIcon = (type) => {
    switch (type) {
      case 'user':
        return <Users className="h-4 w-4" />;
      case 'form':
        return <FileText className="h-4 w-4" />;
      case 'chat':
        return <MessageSquare className="h-4 w-4" />;
      case 'system':
        return <Activity className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const getActivityColor = (type) => {
    switch (type) {
      case 'user':
        return 'bg-blue-100 text-blue-800';
      case 'form':
        return 'bg-green-100 text-green-800';
      case 'chat':
        return 'bg-purple-100 text-purple-800';
      case 'system':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        <CardDescription>
          Latest updates and activities in your system
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {recentActivities.map((activity) => (
            <div key={activity.id} className="flex items-start space-x-3">
              <div className={`p-2 rounded-full ${getActivityColor(activity.type)}`}>
                {getActivityIcon(activity.type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  {activity.title}
                </p>
                <p className="text-sm text-gray-600">
                  {activity.description}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {activity.time}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
