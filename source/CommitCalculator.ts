import { Commit, PullRequest, Repository } from '@octokit/graphql-schema'
import { QueryOption, UserBreakdown, UserCommit } from './Types'
import { computeDuration, durationFormatPattern, mapUsername, octokit, since, unwrapEdge } from './main'
import { Calculator } from './Calculator'
import { commitsHistoryQuery } from './graphql'
import { loopEdges } from './queries'
import { imageField, urlField } from './tables'

export class CommitCalculator extends Calculator<Commit, UserCommit> {
    public getTable(): string[][] {
        return [
            ['#', 'Title', 'Duration', 'Link'],
            ...this.getFilteredItems().map(item => {
                const author = this.getAuthor(item)
                return [
                    imageField(author?.name ?? '', author?.avatar ?? ''),
                    item.messageHeadline,
                    this.formatDurationForItem(item, durationFormatPattern),
                    urlField(item.abbreviatedOid, item.url),
                ]
            }),
        ]
    }

    /**
     * Dont include commits that has associated pull requests as those will be counted on pull request table
     * Also exclude every commits which has 0 duration as those are useless
     */
    public getFilteredItems() {
        return this.getItems()
            .filter(commit => unwrapEdge<Commit>(commit.associatedPullRequests).length === 0)
            .filter(commit => this.getDuration(commit) !== 0)
    }

    public getAuthor(item: Commit) {
        if (item.author) {
            const name = mapUsername(item.author.user?.login ?? item.author.user?.name ?? item.author.name!)

            return {
                name,
                avatar: item.author.user?.avatarUrl ?? `https://github.com/identicons/${encodeURI(name)}.png`,
            }
        }

        return null
    }

    public calculate(): UserBreakdown[] {
        const users: Record<string, UserBreakdown> = {}

        for (const commit of this.items) {
            const user = commit.author?.user

            if (user) {
                const name = mapUsername(user.login ?? user.name)

                if (users[name] === undefined) {
                    users[name] = {
                        name,
                        avatar: user.avatarUrl,
                        duration: 0,
                        commits: 0,
                        comments: 0,
                        issues: 0,
                        pullRequests: 0,
                    }
                }

                users[name].duration += computeDuration(commit.messageHeadline)
                users[name].commits++
            }
        }

        return Object.values(users)
    }

    public getDurationParsableField(commit: Commit) {
        return [commit.messageHeadline]
    }

    public resolveItemIdentifier(item: Commit) {
        return item.oid
    }

    async initialize() {
        const commits = await this.getCommits({
            name: this.repository.name!,
            owner: this.repository.owner!,
            since: since.toISO(),
        })

        for (const commit of commits) {
            this.add(commit)
        }
    }

    public addDuration(item: Commit, duration: number): void {
        if (unwrapEdge<PullRequest>(item.associatedPullRequests).length === 0) {
            super.addDuration(item, duration)
        }
    }

    async getCommits(options: QueryOption): Promise<Commit[]> {
        const response = await octokit.graphql<{ repository: Repository }>(commitsHistoryQuery, options)
        const target = response.repository?.defaultBranchRef?.target as Commit

        return await loopEdges<Commit>(target.history, {
            onNext: cursor => this.getCommits({ ...options, after: cursor }),
        })
    }

    public formatEntity(commit: Commit) {
        // /**
        //  * If has Pull requests.. skip
        //  */
        // if (unwrapEdge<PullRequest>(commit.associatedPullRequests).length) {
        //     return
        // }

        const duration = computeDuration(commit.messageHeadline)

        if (duration) {
            return {
                id: commit.id,
                abbreviatedOid: commit.abbreviatedOid,
                url: commit.url,
                title: commit.messageHeadline,
                duration: duration,
                authorAvatar: commit.author?.user?.avatarUrl,
                authorName: mapUsername(
                    commit.author?.user?.login ?? commit.author?.user?.name ?? commit.author!.name!
                ),
            }
        }
    }
}
