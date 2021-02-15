import { Author, UserBreakdown, UserIssue } from './Types'
import { durationFormatPattern, mapUsername } from './main'
import { Calculator } from './Calculator'
import { PullRequestCalculator } from './PullRequestCalculator'
import { imageField } from './tables'
import { CommitCalculator } from './CommitCalculator'
import { IssueCalculator } from './IssueCalculator'

export class UserCalculator extends Calculator<Author, UserIssue> {
    private metrics: Record<
        string,
        {
            commits: number
            pullRequests: number
            issues: number
        }
    > = {}

    public getTable(): string[][] {
        return [
            ['Author', 'Duration', 'Commits', 'Pull Request', 'Issues'],
            ...this.items.map(user => {
                return [
                    imageField(user.name, user.avatar) + ` ${user.name}`,
                    this.formatDurationForItem(user, durationFormatPattern),
                    this.metrics[user.name].commits.toString(),
                    this.metrics[user.name].pullRequests.toString(),
                    this.metrics[user.name].issues.toString(),
                ]
            }),
        ]
    }

    public getAuthor(item: Author) {
        return {
            ...item,
            name: mapUsername(item.name),
        }
    }

    public getDurationParsableField(user: Author) {
        return []
    }

    public resolveItemIdentifier(user: Author) {
        return user.name
    }

    calculate(): UserBreakdown[] {
        return []
    }

    async initialize(
        pullRequestCalculator: PullRequestCalculator,
        commitCalculator: CommitCalculator,
        issuesCalculator: IssueCalculator
    ) {
        this.addCalculators(commitCalculator, 'commits')
        this.addCalculators(pullRequestCalculator, 'pullRequests')
        this.addCalculators(issuesCalculator, 'issues')
    }

    private addCalculators(calculator: Calculator<any, any>, metricsKey: 'commits' | 'pullRequests' | 'issues') {
        for (const item of calculator.getItems()) {
            const author = calculator.getAuthor(item)

            if (author) {
                if (this.exist(author) === false) {
                    this.add(author)
                }

                this.addDuration(author, calculator.getDuration(item))

                if (this.metrics[author.name] === undefined) {
                    this.metrics[author.name] = {
                        pullRequests: 0,
                        commits: 0,
                        issues: 0,
                    }
                }

                this.metrics[author.name][metricsKey]++
            }
        }
    }

    formatEntity(issue: Author) {}
}
