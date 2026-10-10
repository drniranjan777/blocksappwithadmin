import { Module } from '@nestjs/common';
import { ReachCoreModule } from '../reach/reach-core.module.js';
import { CommentsController } from './comments/comments.controller.js';
import { CommentsService } from './comments/comments.service.js';
import { EngagementController } from './engagement/engagement.controller.js';
import { EngagementService } from './engagement/engagement.service.js';
import { FeedController } from './feed/feed.controller.js';
import { FeedService } from './feed/feed.service.js';
import { TrendingService } from './feed/trending.service.js';
import { BlocksService } from './follows/blocks.service.js';
import { FollowsController } from './follows/follows.controller.js';
import { FollowsService } from './follows/follows.service.js';
import { ReelReader } from './reels/reel-reader.service.js';
import { ReelsReadController } from './reels/reels-read.controller.js';
import { PostsController } from './posts/posts.controller.js';
import { PostsService } from './posts/posts.service.js';
import { ProfilesController } from './profiles/profiles.controller.js';
import { ProfilesService } from './profiles/profiles.service.js';
import { DefaultMediaViews, MediaViews } from './shared/media-views.js';
import { MentionsService } from './shared/mentions.service.js';
import { RelationshipsService } from './shared/relationships.service.js';
import { StoriesController } from './stories/stories.controller.js';
import { StoriesService } from './stories/stories.service.js';

/**
 * People and what they publish: profiles, following, blocking, posts, comments,
 * likes, saves, shares, stories and the feeds that bring them together.
 */
@Module({
  imports: [ReachCoreModule],
  controllers: [
    ProfilesController,
    FollowsController,
    PostsController,
    EngagementController,
    CommentsController,
    FeedController,
    StoriesController,
    ReelsReadController,
  ],
  providers: [
    { provide: MediaViews, useClass: DefaultMediaViews },
    RelationshipsService,
    MentionsService,
    ProfilesService,
    FollowsService,
    BlocksService,
    PostsService,
    EngagementService,
    CommentsService,
    FeedService,
    TrendingService,
    StoriesService,
    ReelReader,
  ],
  exports: [
    ReelReader,
    MediaViews,
    RelationshipsService,
    MentionsService,
    PostsService,
    TrendingService,
    StoriesService,
  ],
})
export class SocialModule {}
