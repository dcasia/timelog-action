import { Commit, Issue, IssueComment, PullRequest } from '@octokit/graphql-schema'
import { QueryOption, UserBreakdown, UserComment } from './Types'
import { computeDuration, mapUsername, octokit } from './main'
import { Calculator } from './Calculator'
import { pullRequestCommentsNode } from './graphql'
import { loopEdges } from './queries'

export class CommentCalculator extends Calculator<IssueComment, UserComment> {
    public getAuthor(item: IssueComment) {
        if (item.author) {
            return {
                name: mapUsername(item.author.login),
                avatar: item.author.avatarUrl,
            }
        }

        return null
    }

    public resolveItemIdentifier(comment: IssueComment) {
        return comment.id
    }

    public getDurationParsableField(comment: IssueComment) {
        return [comment.bodyText]
    }

    public calculate(): UserBreakdown[] {
        const users: Record<string, UserBreakdown> = {}

        for (const comment of this.items) {
            const author = comment.author
            if (author) {
                const name = mapUsername(author.login)

                if (users[name] === undefined) {
                    users[name] = {
                        name,
                        avatar: author.avatarUrl,
                        duration: 0,
                        commits: 0,
                        issues: 0,
                        comments: 0,
                        pullRequests: 0,
                    }
                }

                users[name].duration += computeDuration(comment.bodyText ?? '')
                users[name].comments++
            }
        }

        return Object.values(users)
    }

    async initialize() {
        // this.add(...await this.getComments(pullRequestCalculator.getItems()))
    }

    async getComments(pullRequests: PullRequest[]): Promise<IssueComment[]> {
        const comments: IssueComment[] = []

        for (const pullRequest of pullRequests) {
            comments.push(...(await this.getCommentsFromPullRequest(pullRequest)))
        }

        return comments
    }

    async queryComments(options: QueryOption): Promise<IssueComment[]> {
        const response = await octokit.graphql<{ node: PullRequest }>(pullRequestCommentsNode, options)

        return await loopEdges<IssueComment>(response.node.comments, {
            onNext: cursor => this.queryComments({ ...options, after: cursor }),
        })
    }

    async getCommentsFromPullRequest(pullRequest: PullRequest): Promise<IssueComment[]> {
        return await loopEdges<IssueComment>(pullRequest.comments, {
            onNext: async cursor => {
                return this.queryComments({ id: pullRequest.id, after: cursor })
            },
        })
    }

    public formatEntity(comment: IssueComment) {
        const duration = computeDuration(comment.bodyText)

        if (duration && comment.author) {
            return {
                id: comment.id,
                url: comment.url,
                duration: duration,
                authorAvatar: comment.author.avatarUrl,
                authorName: mapUsername(comment.author.login),
            }
        }
    }
}
