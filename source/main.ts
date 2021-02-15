import { getInput, setFailed, warning } from '@actions/core'
import { context, getOctokit } from '@actions/github'
import { Commit, Issue, IssueComment, PullRequest, PullRequestCommit, Repository } from '@octokit/graphql-schema'
import { associatedPullRequestsFragmentNode, commitsHistoryQuery, pullRequestCommentsAndCommits } from './graphql'
import { DateTime } from 'luxon'
import parseDuration from 'parse-duration'
import { dot } from 'dot-object'
import githubUrl, { Result } from 'parse-github-url'
import { QueryOption, RepositoryData, UserIssue } from './Types'
import { CommitCalculator } from './CommitCalculator'
import { loopEdges, pullRequestCommentsNodeQuery, pullRequestCommitsNodeQuery } from './queries'
import * as fs from 'fs-extra'
import * as path from 'path'
import { PullRequestCalculator } from './PullRequestCalculator'
import { Calculator } from './Calculator'
import execa from 'execa'
import { IssueCalculator } from './IssueCalculator'
import { CommentCalculator } from './CommentCalculator'
import markdownTable from 'markdown-table'
import { UserCalculator } from './UserCalculator'

const token = getInput('token')
const templatePath = getInput('template')
const masterTemplatePath = getInput('masterTemplate')
const timezone = getInput('timezone')
export const durationFormatPattern = getInput('durationFormatPattern')
const usersAliases = getInput('usersAliases')
const repositories = getInput('repositories').split(/\s|\n/)
export const octokit = getOctokit(token)

const userNameMapping: Record<string, string[]> = usersAliases ? JSON.parse(usersAliases) : {}

export const now = DateTime.local().setZone(timezone)
export const since = now.startOf('month')
export let total = 0

async function run(): Promise<void> {
    const addedFiles: string[] = []
    const repositoriesData: RepositoryData[] = []

    /**
     * Analyse issues
     */
    console.log(JSON.stringify(context))

    const origin = await execa('git', ['config', '--get', 'remote.origin.url'])

    const currentRepository = githubUrl(origin.stdout)

    console.log(JSON.stringify(currentRepository))

    for (const repositoryUrl of repositories) {
        const repository = githubUrl(repositoryUrl)

        /**
         * If repository couldn't be parsed.. skip it
         */
        if (!repository || !(repository.owner && repository.name)) {
            warning(`Could not parse repository ${repositoryUrl}. Skipping...`)
            continue
        }

        const commitCalculator = new CommitCalculator(repository)
        const pullRequestCalculator = new PullRequestCalculator(repository)
        const issueCalculator = new IssueCalculator(repository)
        const commentCalculator = new CommentCalculator(repository)
        const userCalculator = new UserCalculator(repository)

        await commitCalculator.initialize()
        await pullRequestCalculator.initialize(commitCalculator, commentCalculator)
        await commentCalculator.initialize()
        await issueCalculator.initialize(currentRepository!)
        await userCalculator.initialize(pullRequestCalculator, commitCalculator, issueCalculator)

        const repositoryData: RepositoryData = {
            repository,
            breakdown: Calculator.merge(commitCalculator, pullRequestCalculator),
            issues: await issueCalculator.getEntity(),
            pullRequests: await pullRequestCalculator.getEntity(),
            commits: await commitCalculator.getEntity(),
            pullRequestCalculator,
            userCalculator,
            commitCalculator,
            issueCalculator,
        }

        const template = applyTokensToTemplate(
            getTokens(repositoryData),
            await fs.readFile(path.resolve('.github', templatePath), 'utf8')
        )

        const savePath = path.join('repositories', now.year.toString(), repository.name)
        const outputPath = path.join(savePath, currentMonthFilename())

        await fs.ensureDir(savePath)
        await fs.writeFile(outputPath, template)

        addedFiles.push(outputPath)
        repositoriesData.push(repositoryData)

        await issueCalculator.closeAll()
    }

    const masterTemplate = applyTokensToTemplate(
        getMasterTemplateTokens(repositoriesData),
        await fs.readFile(path.resolve('.github', masterTemplatePath), 'utf8')
    )

    await fs.writeFile('README.md', masterTemplate)

    addedFiles.push('README.md')

    /**
     * https://github.community/t/github-actions-bot-email-address/17204/4
     */
    const githubActionBotName = 'github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>'

    try {
        await execa('git', ['config', 'user.name', 'github-actions[bot]'])
        await execa('git', ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'])
        await execa('git', ['add', '--force', ...addedFiles])
        await execa('git', ['commit', '--message', 'Update Files', '--author', githubActionBotName])
        await execa('git', ['push', 'origin', 'development'])
    } catch (error) {
        return setFailed(error)
    }
}

export function unwrapEdge<A>(connection: { edges: { node: A }[] } | undefined | null | any): A[] {
    const nodes: A[] = []

    if (connection && connection.edges?.length) {
        for (const edge of connection.edges) {
            if (edge && edge.node) {
                nodes.push(edge.node)
            }
        }
    }

    return nodes
}

export function currentMonthFilename(): string {
    return `${now.toFormat('MM')} - ${now.monthLong}.md`
}

function getMasterTemplateTokens(repositoriesData: RepositoryData[]): Record<string, any> {
    return dot({
        table: {
            breakdown: markdownTable(Calculator.getMasterTable(repositoriesData)),
        },
        date: {
            now: now.toFormat('DDD t'),
            monthLong: now.monthLong,
            monthShort: now.monthShort,
            isoDate: now.toISODate(),
            http: now.toHTTP(),
            object: now.toObject(),
        },
    })
}

function getTokens(repositoryData: RepositoryData): Record<string, any> {
    return dot({
        totalDuration: Calculator.getFormattedTotalDuration(
            [repositoryData.pullRequestCalculator, repositoryData.commitCalculator, repositoryData.issueCalculator],
            durationFormatPattern
        ),
        repository: repositoryData.repository,
        table: {
            breakdown: markdownTable(repositoryData.userCalculator.getTable()),
            pullRequests: markdownTable(repositoryData.pullRequestCalculator.getTable()),
            issues: markdownTable(repositoryData.issueCalculator.getTable()),
            commits: markdownTable(repositoryData.commitCalculator.getTable()),
        },
        date: {
            now: now.toFormat('DDD t'),
            monthLong: now.monthLong,
            monthShort: now.monthShort,
            isoDate: now.toISODate(),
            http: now.toHTTP(),
            object: now.toObject(),
        },
    })
}

function applyTokensToTemplate(tokens: Record<string, any>, template: string): string {
    for (const key in tokens) {
        const token = tokens[key]

        template = template.replace(new RegExp(`\{\{(\\s+)?${key}(\\s+)?\}\}`, 'g'), token)
    }

    return template
}

function formatIssuesData(issues: Issue[], repository: Result): UserIssue[] {
    return issues
        .filter(issue => issue.labels?.nodes?.find(label => label?.name === repository.path))
        .map(issue => {
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
        })
}

export function computeDuration(...texts: string[]): number {
    const duration = texts
        .filter(Boolean)
        .map(text =>
            text.replace(/[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g, '')
        )
        .reduce((left, right) => left + (parseDuration(right, 'millisecond') ?? 0), 0)

    return (total += duration), duration
}

export function mapUsername(username: string): string {
    for (const name in userNameMapping) {
        const aliases = userNameMapping[name]

        if (aliases.includes(username)) {
            return name
        }
    }

    return username
}

export async function getPullRequestCommentsAndCommitsHistory(
    options: QueryOption
): Promise<{ commits: PullRequestCommit[]; comments: IssueComment[] }> {
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

async function getAssociatedPullRequestsHistory(options: QueryOption): Promise<PullRequest[]> {
    const response = await octokit.graphql<{ node: Commit }>(associatedPullRequestsFragmentNode, options)
    const pullRequestConnection = response.node.associatedPullRequests!

    return await loopEdges<PullRequest>(pullRequestConnection, {
        onNext: cursor => getAssociatedPullRequestsHistory({ ...options, after: cursor }),
    })
}

async function getRepositoryHistory(options: QueryOption): Promise<{ commits: Commit[]; pullRequests: PullRequest[] }> {
    const response = await octokit.graphql<{ repository: Repository }>(commitsHistoryQuery, options)
    const target = response.repository?.defaultBranchRef?.target as Commit
    const pullRequests: PullRequest[] = []

    const commits = await loopEdges<Commit>(target.history, {
        async onNode(commit) {
            const pullRequestConnection = commit.associatedPullRequests

            if (pullRequestConnection) {
                pullRequests.push(
                    ...(await loopEdges<PullRequest>(pullRequestConnection, {
                        onNext: cursor => getAssociatedPullRequestsHistory({ id: commit.id, after: cursor }),
                    }))
                )
            }

            return commit
        },
        onNext: async cursor => (await getRepositoryHistory({ ...options, after: cursor })).commits,
    })

    return {
        commits,
        pullRequests,
    }
}

async function getIssueHistory(
    query: string,
    options: Record<string, string | number>,
    after: string | null = null
): Promise<Issue[]> {
    const response = await octokit.graphql<{ repository: Repository }>(query, { ...options, after })
    const issuesConnection = response.repository?.issues

    return await loopEdges<Issue>(issuesConnection, {
        async onNext(cursor, currentData) {
            /**
             * If the issues are all from this month.. keep calling, keep calling until find some which arent
             */
            if (currentData.every(element => DateTime.fromISO(element.createdAt).month === now.month)) {
                return getIssueHistory(query, options, cursor)
            }
        },
    })
}

run()
    .then(() => console.log('Completed.'))
    .catch((error: Error) => {
        console.log(error.stack)

        setFailed(error.message)
    })
