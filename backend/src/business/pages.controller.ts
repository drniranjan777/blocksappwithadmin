import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { CurrentUser, Publishes } from '../common/decorators/route-metadata.js';
import type { AuthContext } from '../common/http/request.js';
import { PageQueryDto } from '../common/pagination/page-query.dto.js';
import { BUSINESS_CATEGORIES } from './business-rules.js';
import { PagesService } from './pages.service.js';

const uuid = () => new ParseUUIDPipe();

class CreatePageDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsIn(BUSINESS_CATEGORIES)
  category!: string;

  /** Leave out to get one made from the name. Lower-case letters, digits and hyphens. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Matches(/^[a-z0-9-]*$/)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(254)
  contactEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  websiteUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  district?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsUUID()
  avatarMediaId?: string;

  @IsOptional()
  @IsUUID()
  coverMediaId?: string;
}

/** Every field optional; `null` clears one that can be empty. */
class UpdatePageDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @IsIn(BUSINESS_CATEGORIES)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Matches(/^[a-z0-9-]*$/)
  slug?: string;

  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsString()
  @MaxLength(254)
  contactEmail?: string | null;

  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  websiteUrl?: string | null;

  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  state?: string | null;

  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  district?: string | null;

  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string | null;

  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsUUID()
  avatarMediaId?: string | null;

  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsUUID()
  coverMediaId?: string | null;
}

class OfferDto {
  @IsString()
  @Length(3, 120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  description?: string;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string;
}

class AnalyticsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days?: number;
}

@ApiTags('business')
@ApiBearerAuth('user')
@Controller('business')
export class PagesController {
  constructor(private readonly pages: PagesService) {}

  @Get('categories')
  @ApiOperation({ summary: 'The categories a page can be in' })
  categories() {
    return { categories: [...BUSINESS_CATEGORIES] };
  }

  @Get('pages/mine')
  @ApiOperation({ summary: 'Your pages, drafts included' })
  mine(@CurrentUser() u: AuthContext) {
    return this.pages.mine(u.userId);
  }

  @Publishes()
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @Post('pages')
  @ApiOperation({
    summary: 'Create a business page',
    description:
      'A draft that only you can see until you publish it. You need a verified e-mail or phone number, and there is a limit on how many pages one person can have.',
  })
  create(@CurrentUser() u: AuthContext, @Body() dto: CreatePageDto) {
    return this.pages.create(u.userId, dto);
  }

  @Get('pages/:ref')
  @ApiOperation({
    summary: 'A page, by id or address',
    description:
      'Published pages are visible to everyone who is not blocked; a draft only to its owner.',
  })
  get(@CurrentUser() u: AuthContext, @Param('ref') ref: string) {
    return this.pages.get(u.userId, ref);
  }

  @Publishes()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Patch('pages/:id')
  @ApiOperation({
    summary: 'Edit your page',
    description:
      'Renaming or recategorising a verified page removes its badge (the response says so), because the badge was for that name.',
  })
  update(
    @CurrentUser() u: AuthContext,
    @Param('id', uuid()) id: string,
    @Body() dto: UpdatePageDto,
  ) {
    return this.pages.update(u.userId, id, dto);
  }

  @Publishes()
  @Post('pages/:id/publish')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Publish a draft',
    description: 'Needs a description, a state and a way to contact the business.',
  })
  publish(@CurrentUser() u: AuthContext, @Param('id', uuid()) id: string) {
    return this.pages.publish(u.userId, id);
  }

  @Post('pages/:id/unpublish')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Take a page back to a draft',
    description: 'Refused while it has campaigns in review, approved, running or paused.',
  })
  unpublish(@CurrentUser() u: AuthContext, @Param('id', uuid()) id: string) {
    return this.pages.unpublish(u.userId, id);
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('pages/:ref/follow')
  @HttpCode(200)
  @ApiOperation({ summary: 'Follow a page' })
  follow(@CurrentUser() u: AuthContext, @Param('ref') ref: string) {
    return this.pages.follow(u.userId, ref);
  }

  @Delete('pages/:ref/follow')
  @ApiOperation({ summary: 'Stop following a page' })
  unfollow(@CurrentUser() u: AuthContext, @Param('ref') ref: string) {
    return this.pages.unfollow(u.userId, ref);
  }

  @Get('pages/:ref/posts')
  @ApiOperation({ summary: 'What a page has posted (cursor-paginated, newest first)' })
  posts(@CurrentUser() u: AuthContext, @Param('ref') ref: string, @Query() q: PageQueryDto) {
    return this.pages.postsOf(u.userId, ref, q);
  }

  @Get('pages/:ref/offers')
  @ApiOperation({ summary: 'The offers a page has on now' })
  offers(@CurrentUser() u: AuthContext, @Param('ref') ref: string) {
    return this.pages.offers(u.userId, ref);
  }

  @Publishes()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('pages/:id/offers')
  @ApiOperation({ summary: 'Add an offer to your page' })
  addOffer(@CurrentUser() u: AuthContext, @Param('id', uuid()) id: string, @Body() dto: OfferDto) {
    return this.pages.addOffer(u.userId, id, dto);
  }

  @Delete('pages/:id/offers/:offerId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove an offer' })
  async removeOffer(
    @CurrentUser() u: AuthContext,
    @Param('id', uuid()) id: string,
    @Param('offerId', uuid()) offerId: string,
  ): Promise<void> {
    await this.pages.removeOffer(u.userId, id, offerId);
  }

  @Get('pages/:id/analytics')
  @ApiOperation({
    summary: 'How your page is doing',
    description: 'For the owner only. Totals and per-day follower gains; never who.',
  })
  analytics(
    @CurrentUser() u: AuthContext,
    @Param('id', uuid()) id: string,
    @Query() q: AnalyticsQuery,
  ) {
    return this.pages.analytics(u.userId, id, q.days ?? 30);
  }
}
