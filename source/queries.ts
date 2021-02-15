import {
    CommitHistoryConnection,
    IssueComment,
    IssueCommentConnection,
    IssueConnection,
    PullRequest,
    PullRequestCommit,
    PullRequestCommitConnection,
    PullRequestConnection,
    Repository,
} from '@octokit/graphql-schema'
import { pullRequestCommentsNode, pullRequestCommitsNode, pullRequestsWithCommits } from './graphql'
import { now, octokit } from './main'
import { QueryOption } from './Types'
import { DateTime } from 'luxon'

export async function loopEdges<A>(
    connection:
        | CommitHistoryConnection
        | IssueConnection
        | PullRequestConnection
        | IssueCommentConnection
        | PullRequestCommitConnection,
    options: Partial<{
        onNext: (cursor: string, data: A[]) => Promise<A[] | void>
        onNode: (node: A) => A | Promise<A>
    }> = {}
): Promise<A[]> {
    const data: A[] = []

    let lastCursor: string | null = null

    if (connection.edges && connection.edges.length) {
        for (const edge of connection.edges) {
            if (edge) {
                let node = (edge.node as unknown) as A

                if (options.onNode) {
                    node = await options.onNode(node)
                }

                data.push(node)

                lastCursor = edge.cursor
            }
        }
    }

    if (connection.pageInfo.hasNextPage && lastCursor && options.onNext) {
        const response = await options.onNext(lastCursor, data)

        if (response) {
            data.push(...response)
        }
    }

    return data
}

export async function pullRequestCommitsNodeQuery(options: QueryOption): Promise<PullRequestCommit[]> {
    const response = await octokit.graphql<{ node: PullRequest }>(pullRequestCommitsNode, options)
    const pullRequestCommitConnection = response.node.commits

    return await loopEdges<PullRequestCommit>(pullRequestCommitConnection, {
        onNext: cursor => pullRequestCommitsNodeQuery({ ...options, after: cursor }),
    })
}

export async function pullRequestCommentsNodeQuery(options: QueryOption): Promise<IssueComment[]> {
    const response = await octokit.graphql<{ node: PullRequest }>(pullRequestCommentsNode, options)
    const issueCommentConnection = response.node.comments

    return await loopEdges<IssueComment>(issueCommentConnection, {
        onNext: cursor => pullRequestCommentsNodeQuery({ ...options, after: cursor }),
    })
}

export async function pullRequestWithCommitsQuery(
    options: QueryOption
): Promise<{ pullRequests: PullRequest[]; pullRequestCommits: PullRequestCommit[] }> {
    const response = await octokit.graphql<{ repository: Repository }>(pullRequestsWithCommits, options)
    const pullRequestConnection = response.repository?.pullRequests
    const pullRequestCommits: PullRequestCommit[] = []

    const pullRequests = await loopEdges<PullRequest>(pullRequestConnection, {
        async onNode(pullRequest) {
            pullRequestCommits.push(
                ...(await loopEdges<PullRequestCommit>(pullRequest.commits, {
                    onNext: cursor => pullRequestCommitsNodeQuery({ id: pullRequest.id, after: cursor }),
                }))
            )

            return pullRequest
        },
        async onNext(cursor, currentData) {
            /**
             * If the issues are all from this month.. keep calling until find some which arent
             */
            if (currentData.every(element => DateTime.fromISO(element.closedAt).month === now.month)) {
                const response = await pullRequestWithCommitsQuery({ ...options, after: cursor })

                pullRequestCommits.push(...response.pullRequestCommits)

                return response.pullRequests
            }
        },
    })

    return {
        pullRequests,
        pullRequestCommits,
    }
}
