import { RepositoryData, UserBreakdown, UserCommit, UserIssue, UserPullRequests } from './Types'
import markdownTable from 'markdown-table'
import { Duration } from 'luxon'
import { currentMonthFilename, durationFormatPattern, now, total } from './main'
import { Result } from 'parse-github-url'
import { PullRequestCalculator } from './PullRequestCalculator'

export function generateBreakdownTable(users: UserBreakdown[]): string {
    return markdownTable([
        ['Author', 'Duration', 'Commits', 'Pull Request', 'Issues'],
        ...users.map(user => [
            `![](${user.avatar}) ${user.name}`,
            Duration.fromMillis(user.duration).toFormat(durationFormatPattern),
            user.commits.toString(),
            user.pullRequests.toString(),
            user.issues.toString(),
        ]),
    ])
}

export function generateMasterTemplateTable(repositories: RepositoryData[]) {
    const encodedUrl = (repository: Result) => {
        return encodeURI(`/repositories/${now.year}/${repository.name}/${currentMonthFilename()}`)
    }
    return markdownTable([
        ['Repository', 'Total', 'Commits'],
        ...repositories.map(repository => [
            `[${repository.repository.name}](${encodedUrl(repository.repository)})`,
            Duration.fromMillis(total).toFormat(durationFormatPattern),
            repository.breakdown.reduce((left, right) => left + right.commits, 0).toString(),
        ]),
    ])
}

export function generateCommitsTable(commits: UserCommit[]) {
    return markdownTable([
        ['#', 'Title', 'Duration', 'Link'],
        ...commits.map(commit => [
            commit.authorAvatar ? `![${commit.authorName}](${commit.authorAvatar})` : '#',
            commit.title,
            Duration.fromMillis(commit.duration).toFormat(durationFormatPattern),
            `[${commit.abbreviatedOid}](${commit.url})`,
        ]),
    ])
}

export function generateIssuesTable(issues: UserIssue[]) {
    return markdownTable([
        ['#', 'Title', 'Duration', 'Link'],
        ...issues.map(issue => [
            `![${issue.author}](${issue.avatar})`,
            issue.title,
            Duration.fromMillis(issue.duration).toFormat(durationFormatPattern),
            `[#${issue.number}](${issue.url})`,
        ]),
    ])
}

export function imageField(label: string, url: string) {
    return `<img src="${url}" alt="${label}" width="12" height="12">`
}

export function urlField(label: string, url: string) {
    return `[${label}](${url})`
}

export function issueOrPullRequestField(label: string, url: string) {
    return `[#${label}](${url})`
}

export function generatePullRequestTable(users: UserPullRequests[], calculator: PullRequestCalculator): string {
    return markdownTable([
        ['#', 'Pull Request', 'Duration', 'State', 'Link'],
        ...calculator
            .getItems()
            .map(item => [
                calculator.formatDurationForItem(item, durationFormatPattern),
                calculator.formatDurationForItem(item, durationFormatPattern),
                calculator.formatDurationForItem(item, durationFormatPattern),
                calculator.formatDurationForItem(item, durationFormatPattern),
                calculator.formatDurationForItem(item, durationFormatPattern),
            ]),
        // ...users.map(user => [
        //     `![${user.name}](${user.avatar})`,
        //     user.title,
        //     calculator.formatDurationForItem(user, durationFormatPattern),
        //     user.state,
        //     `[#${user.number}](${user.url})`,
        // ]),
    ])
}
