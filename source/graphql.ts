const edge = (...nodes: string[]) => `
    pageInfo {
        hasNextPage
    }
    edges {
        cursor
        node {
            ${nodes.join('\n')}         
        }
    }
`

const commitFragment = `
    oid
    abbreviatedOid
    messageHeadline
    url
    author {
        name
        user {
            name
            login
            avatarUrl(size: 12)
        }
    }
`

export const closeIssueMutation = `
mutation ($issueId: String!, $body: String!) {
  addComment(input: {subjectId: $issueId, body: $body}) {
    __typename
  }
  closeIssue(input: {issueId: $issueId}) {
    __typename
  }
}
`

export const issuesQuery = `
query ($after: String, $name: String!, $owner: String!, $labels: [String!]) {
    repository(name: $name, owner: $owner) {
        issues(first: 100, after: $after, labels: $labels) {
            pageInfo {
                hasNextPage
            }
            edges {
                cursor
                node {
                    id
                    title
                    bodyText
                    createdAt
                    url
                    number
                    state
                    author {
                        avatarUrl(size: 12)
                        login
                    }
                    labels(first: 100) {
                        nodes {
                            name
                        }
                    }
                }
            }
        }
    }
}
`

export const pullRequestCommitFragment = `
    commit { 
        ${commitFragment}
    }
`

export const pullRequestCommentFragment = `
    id
    url    
    bodyText
    author {
        avatarUrl(size: 12)
        login
    }
`

export const lightPullRequestFragment = `
    id
`

export const pullRequestFragment = `
    id
    title
    bodyText
    state
    url
    number
    closedAt
    comments(first: 20) {
        ${edge(pullRequestCommentFragment)}
    }   
    author {
        avatarUrl(size: 12)
        login
    }
`

export const pullRequestsWithCommits = `
    query ($after: String, $name: String!, $owner: String!) {
        repository(name: $name, owner: $owner) {
            pullRequests(first: 100, orderBy: { field: UPDATED_AT, direction: DESC }, after: $after) {
                ${edge(pullRequestFragment)}
            }
        }
    }
`

export const associatedPullRequestsFragmentNode = `
    query ($after: String, $id: ID!) {
        node(id: $id) {
            ...on Commit {
                associatedPullRequests(first: 100, after: $after) {
                    ${edge(pullRequestFragment)}
                }               
            }
        }
    }
`

export const associatedPullRequestsFragment = `
    associatedPullRequests(first: 100) {
        ${edge(lightPullRequestFragment)}
    }
`

export function generatePullRequestQuery(ids: string[]): string {
    const items = ids.map(
        id => `
        ${id}: node (id: "${id}") {
            ...on PullRequest {
                ${pullRequestFragment}
            }
        }
    `
    )
    return `
        query {
            ${items.join('\n')}
        }
    `
}

export const commitsHistoryQuery = `
    query ($after: String, $name: String!, $owner: String!, $since: GitTimestamp!) {
        repository(name: $name, owner: $owner) {
            defaultBranchRef {
                target {
                    ... on Commit {
                        history(since: $since, after: $after, first: 100) {
                            ${edge(commitFragment, associatedPullRequestsFragment)}
                        }
                    }
                }
            }
        }
    }
`
export const pullrequestsQuery = `
query ($after: String, $name: String!, $owner: String!) {
  repository(name: $name, owner: $owner) {
    pullRequests(first: 100, after: $after, orderBy: {field: CREATED_AT, direction: DESC}) {
      pageInfo {
        hasNextPage
      }
      edges {
        cursor
        node {
          id
          title
          bodyText
          url
        }
      }
    }
  }
}
`

export const pullRequestCommitsNode = `
    query ($after: String, $id: ID!) {
        node(id: $id) {
            ...on PullRequest {
                commits(first: 100, after: $after) {
                    ${edge(pullRequestCommitFragment)}
                }               
            }
        }
    }
`

export const pullRequestCommentsNode = `
    query ($after: String, $id: ID!) {
        node(id: $id) {
            ...on PullRequest {
                comments(first: 100, after: $after) {
                    ${edge(pullRequestCommentFragment)}
                }               
            }
        }
    }
`

export const pullRequestCommentsAndCommits = `
    query ($id: ID!) {
        node(id: $id) {
            ...on PullRequest {
                commits(first: 100) {
                    ${edge(pullRequestCommitFragment)}
                }
                comments(first: 100) {
                    ${edge(pullRequestCommentFragment)}                    
                }
            }
        }
    }
`
