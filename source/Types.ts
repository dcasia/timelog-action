import { Duration } from 'luxon'
import { Result } from 'parse-github-url'
import { computeDuration, mapUsername } from './main'
import { PullRequestCalculator } from './PullRequestCalculator'
import { UserCalculator } from './UserCalculator'
import { CommitCalculator } from './CommitCalculator'
import { IssueCalculator } from './IssueCalculator'

export type UserIssue = {
    id: string
    title: string
    duration: number
    author: string
    avatar: string
    number: number
    url: string
    state: string
}

export type RepositoryData = {
    repository: Result
    breakdown: UserBreakdown[]
    pullRequests: UserPullRequests[]
    issues: UserIssue[]
    commits: UserCommit[]
    pullRequestCalculator: PullRequestCalculator
    userCalculator: UserCalculator
    commitCalculator: CommitCalculator
    issueCalculator: IssueCalculator
}

export type UserPullRequests = {
    id: string
    name: string
    avatar: string
    title: string
    url: string
    state: string
    number: number
    duration: number
}

export type UserComment = {
    id: string
    url: string
    duration: number
    authorAvatar: string
    authorName: string
}

export type UserBreakdown = {
    name: string
    avatar: string
    duration: number
    commits: number
    issues: number
    comments: number
    pullRequests: number
}

export type UserCommit = {
    id: string
    title: string
    duration: number
    authorName: string
    authorAvatar: string
    abbreviatedOid: string
    url: string
}

export type QueryOption = Record<string, string | number | string[]>

export type Author = {
    name: string
    avatar: string
}
