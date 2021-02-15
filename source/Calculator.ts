import { Author, RepositoryData, UserBreakdown } from './Types'
import { Result } from 'parse-github-url'
import { Duration } from 'luxon'
import { computeDuration, currentMonthFilename, durationFormatPattern, now } from './main'
import { CommitCalculator } from './CommitCalculator'
import { imageField, urlField } from './tables'

export abstract class Calculator<A, B> {
    protected items: A[] = []
    protected entities: B[] = []
    protected duration: Record<string, number> = {}

    public constructor(protected repository: Result) {}

    abstract getAuthor(item: A): Author | null

    abstract getDurationParsableField(item: A): string[]

    public computeDuration(...text: string[]): number {
        return computeDuration(...text)
    }

    public getFilteredItems(): A[] {
        return this.getItems()
    }

    public formatDurationForItem(item: A, format: string): string {
        return Duration.fromMillis(this.getDuration(item)).toFormat(format)
    }

    public addDuration(item: A, duration: number): void {
        const identifier = this.resolveItemIdentifier(item)

        if (this.duration[identifier] === undefined) {
            this.duration[identifier] = 0
        }

        this.duration[identifier] += duration
    }

    public getDuration(item: A): number {
        const identifier = this.resolveItemIdentifier(item)

        if (this.duration[identifier] === undefined) {
            return (this.duration[identifier] = 0)
        }

        return this.duration[identifier]
    }

    abstract resolveItemIdentifier(item: A): string

    public add(...items: A[]): void {
        for (const item of items) {
            if (this.exist(item) === false) {
                this.items.push(item)
                this.addDuration(item, this.computeDuration(...this.getDurationParsableField(item)))
            }
        }
    }

    public getItems(): A[] {
        return this.items
    }

    public exist(entry: A): boolean {
        return (
            this.items.find(item => this.resolveItemIdentifier(item) === this.resolveItemIdentifier(entry)) !==
            undefined
        )
    }

    abstract calculate(): UserBreakdown[]

    abstract formatEntity(item: A): B | void

    public getEntity(): B[] {
        return this.entities
    }

    public static merge(...calculators: Calculator<unknown, unknown>[]): UserBreakdown[] {
        const users: Record<string, UserBreakdown> = {}

        for (const calculator of calculators) {
            for (const user of calculator.calculate()) {
                if (users[user.name] === undefined) {
                    users[user.name] = user
                } else {
                    users[user.name].duration += user.duration
                    users[user.name].commits += user.commits
                    users[user.name].comments += user.comments
                    users[user.name].issues += user.issues
                    users[user.name].pullRequests += user.pullRequests
                }
            }
        }

        return Object.values(users)
    }

    public getTotalDuration(): number {
        return Object.values(this.duration).reduce((left, right) => right + left, 0)
    }

    public static getFormattedTotalDuration(calculators: Calculator<any, any>[], pattern: string): string {
        return Duration.fromMillis(calculators.reduce((left, right) => right.getTotalDuration() + left, 0)).toFormat(
            pattern
        )
    }

    public static getMasterTable(data: RepositoryData[]): string[][] {
        return [
            ['Repository', 'Total', 'Commits', 'Pull Request', 'Issues'],
            ...data.map(repositoryData => {
                const encodedUrl = (repository: Result) => {
                    return encodeURI(`/repositories/${now.year}/${repository.name}/${currentMonthFilename()}`)
                }

                return [
                    urlField(repositoryData.repository.name!, encodedUrl(repositoryData.repository)),
                    Calculator.getFormattedTotalDuration(
                        [
                            repositoryData.pullRequestCalculator,
                            repositoryData.commitCalculator,
                            repositoryData.issueCalculator,
                        ],
                        durationFormatPattern
                    ),
                    repositoryData.commitCalculator.getItems().length.toString(),
                    repositoryData.pullRequestCalculator.getItems().length.toString(),
                    repositoryData.issueCalculator.getItems().length.toString(),
                ]
            }),
        ]
    }
}
