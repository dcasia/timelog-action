import { Issue, Repository } from '@octokit/graphql-schema'
import { QueryOption, UserBreakdown, UserIssue } from './Types'
import { computeDuration, durationFormatPattern, mapUsername, now, octokit } from './main'
import { Calculator } from './Calculator'
import { imageField, issueOrPullRequestField } from './tables'
import { loopEdges } from './queries'
import { DateTime } from 'luxon'
import { closeIssueMutation, issuesQuery } from './graphql'
import { Result } from 'parse-github-url'

export class IssueCalculator extends Calculator<Issue, UserIssue> {
    async closeAll() {
        const promises: Promise<void>[] = []

        for (const issue of this.getItems()) {
            if (issue.state === 'CLOSED') {
                continue
            }

            const options = {
                issueId: issue.id,
                body: `This issue has been tracked and will be included in the \`${now.monthLong.toLowerCase()}\` report.`,
            }

            promises.push(octokit.graphql(closeIssueMutation, options))
        }

        await Promise.all(promises)
    }

    public getTable(): string[][] {
        return [
            ['#', 'Title', 'Duration', 'Link'],
            ...this.getItems().map(item => {
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

    public getAuthor(item: Issue) {
        if (item.author) {
            return {
                name: mapUsername(item.author.login),
                avatar: item.author.avatarUrl,
            }
        }

        return null
    }

    public getDurationParsableField(issue: Issue) {
        return [issue.bodyText]
    }

    public resolveItemIdentifier(issue: Issue) {
        return issue.id
    }

    calculate(): UserBreakdown[] {
        return []
    }

    async initialize(repository: Result) {
        const issues = await this.getIssueHistory({
            name: repository.name!,
            owner: repository.owner!,
            labels: [this.repository.path!],
        })

        this.add(...issues)
    }

    async getIssueHistory(options: QueryOption): Promise<Issue[]> {
        const response = await octokit.graphql<{ repository: Repository }>(issuesQuery, options)

        return await loopEdges<Issue>(response.repository?.issues, {
            onNext: async (cursor, currentData) => {
                /**
                 * If the issues are all from this month.. keep calling, keep calling until find some which arent
                 */
                if (currentData.every(element => DateTime.fromISO(element.createdAt).month === now.month)) {
                    return this.getIssueHistory({ ...options, after: cursor })
                }
            },
        })
    }

    formatEntity(issue: Issue) {
        if (issue.labels?.nodes?.find(label => label?.name === this.repository.path)) {
            return {
                id: issue.id,
                title: issue.title,
                author: issue.author!.login,
                avatar: issue.author!.avatarUrl,
                number: issue.number,
                url: issue.url,
                state: issue.state,
                duration: computeDuration(issue.title, issue.bodyText),
            }
        }
    }
}
