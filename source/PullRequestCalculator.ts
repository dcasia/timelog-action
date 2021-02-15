import { Commit, IssueComment, PullRequest, PullRequestCommit } from '@octokit/graphql-schema'
import { QueryOption, UserBreakdown, UserPullRequests } from './Types'
import { computeDuration, durationFormatPattern, mapUsername, octokit, unwrapEdge } from './main'
import { Calculator } from './Calculator'
import { generatePullRequestQuery, pullRequestCommentsAndCommits, pullRequestCommitsNode } from './graphql'
import { CommitCalculator } from './CommitCalculator'
import { loopEdges, pullRequestCommentsNodeQuery, pullRequestCommitsNodeQuery } from './queries'
import { CommentCalculator } from './CommentCalculator'
import { imageField, issueOrPullRequestField } from './tables'

export class PullRequestCalculator extends Calculator<PullRequest, UserPullRequests> {
    public getAuthor(item: PullRequest) {
        if (item.author) {
            return {
                name: mapUsername(item.author.login),
                avatar: item.author.avatarUrl,
            }
        }

        return null
    }

    public getFilteredItems(): PullRequest[] {
        return this.getItems().filter(pullRequest => this.getDuration(pullRequest) !== 0)
    }

    public getTable(): string[][] {
        return [
            ['#', 'Pull Request', 'Duration', 'Link'],
            ...this.getFilteredItems().map(item => {
                const author = this.getAuthor(item)

                return [
                    imageField(author?.name ?? '', author?.avatar ?? ''),
                    item.title,
                    this.formatDurationForItem(item, durationFormatPattern),
                    issueOrPullRequestField(item.number.toString(), item.url),
                ]
            }),
        ]
    }

    public resolveItemIdentifier(pullRequest: PullRequest) {
        return pullRequest.id
    }

    public getDurationParsableField(item: PullRequest) {
        return [item.bodyText]
    }

    public formatEntity(pullRequest: PullRequest) {
        if (pullRequest.author) {
            return {
                id: pullRequest.id,
                title: pullRequest.title,
                url: pullRequest.url,
                number: pullRequest.number,
                state: pullRequest.state,
                avatar: pullRequest.author.avatarUrl,
                name: mapUsername(pullRequest.author.login),
                duration: computeDuration(pullRequest.bodyText),
            }
        }
    }

    public async initialize(commitCalculator: CommitCalculator, commentCalculator: CommentCalculator) {
        this.add(...(await this.getPullRequests(commitCalculator.getItems())))

        for (const pullRequest of this.items) {
            const { commits, comments } = await this.getCommitsAndComments(pullRequest)

            for (const { commit } of commits) {
                this.addDuration(
                    pullRequest,
                    this.computeDuration(...commitCalculator.getDurationParsableField(commit))
                )
            }

            for (const comment of comments) {
                commentCalculator.add(comment)

                this.addDuration(pullRequest, commentCalculator.getDuration(comment))
            }
        }
    }

    async queryCommits(options: QueryOption): Promise<Commit[]> {
        const response = await octokit.graphql<{ node: PullRequest }>(pullRequestCommitsNode, options)

        return await loopEdges<Commit>(response.node.commits, {
            onNext: cursor => this.queryCommits({ ...options, after: cursor }),
        })
    }

    async getCommitsAndComments(
        pullRequest: PullRequest
    ): Promise<{ commits: PullRequestCommit[]; comments: IssueComment[] }> {
        const options = { id: pullRequest.id }
        const response = await octokit.graphql<{ node: PullRequest }>(pullRequestCommentsAndCommits, options)
        const issueCommentConnection = response.node.comments
        const pullRequestCommitConnection = response.node.commits

        const commits = await loopEdges<PullRequestCommit>(pullRequestCommitConnection, {
            onNext: cursor => pullRequestCommitsNodeQuery({ ...options, after: cursor }),
        })

        const comments = await loopEdges<IssueComment>(issueCommentConnection, {
            onNext: cursor => pullRequestCommentsNodeQuery({ ...options, after: cursor }),
        })

        return {
            commits,
            comments,
        }
    }

    async getPullRequests(commits: Commit[]): Promise<PullRequest[]> {
        const associatedPullRequests: Pick<PullRequest, 'id'>[] = []

        for (const commit of commits) {
            associatedPullRequests.push(...unwrapEdge<PullRequest>(commit.associatedPullRequests))
        }

        const pullRequestIds = [...new Set(associatedPullRequests.map(({ id }) => id))]

        if (pullRequestIds.length) {
            return Object.values(
                await octokit.graphql<{ [key in string]: PullRequest }>(generatePullRequestQuery(pullRequestIds))
            )
        }

        return []
    }

    public calculate(): UserBreakdown[] {
        const users: Record<string, UserBreakdown> = {}

        for (const pullRequest of this.items) {
            const user = pullRequest.author

            if (user) {
                const name = mapUsername(user.login)

                if (users[name] === undefined) {
                    users[name] = {
                        name,
                        avatar: user.avatarUrl,
                        duration: 0,
                        commits: 0,
                        issues: 0,
                        comments: 0,
                        pullRequests: 0,
                    }
                }

                users[name].duration += computeDuration(pullRequest.title, pullRequest.bodyText)
                users[name].pullRequests++
            }
        }

        return Object.values(users)
    }
}
