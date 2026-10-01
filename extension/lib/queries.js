// GraphQL documents sent to Toddle's API.
//
// STUDENT_TASKS is the Toddle web client's own "To-do" query, verbatim, so it
// matches what the server expects. USER_COURSES is a trimmed version of the
// web client's getUserCourses that keeps only fields we display.

self.TU_QUERIES = {
  STUDENT_TASKS: `query getStudentTasks($userId: ID!, $studentIds: [ID!], $filters: TaskFilter, $first: Int, $after: String, $orderByDirection: ORDER_BY_DIRECTION, $type: ENTITY_TYPE_ENUM!) {
  node(id: $userId, type: $type) {
    id
    ... on Student {
      id
      tasks(filters: $filters, first: $first, after: $after, orderByDirection: $orderByDirection) {
        pageInfo {
          hasNextPage
          hasPreviousPage
          startCursor
          endCursor
          __typename
        }
        totalCount
        edges {
          id
          orderDate
          itemType
          item {
            id
            ... on StudentAssignment {
              ...studentAssignmentItem
              __typename
            }
            ... on ProjectDeadline {
              ...projectDeadlineItem
              __typename
            }
            ... on ProjectTaskResponse {
              id
              mappedProject: project {
                id
                projectGroup {
                  id
                  type
                  subType
                  courses {
                    edges {
                      node {
                        id
                        __typename
                      }
                      __typename
                    }
                    __typename
                  }
                  __typename
                }
                __typename
              }
              task {
                ...projectGroupTaskItem
                __typename
              }
              latestSubmissionResponse {
                id
                status
                __typename
              }
              __typename
            }
            __typename
          }
          __typename
        }
        __typename
      }
      __typename
    }
    ... on FamilyMember {
      id
      tasks(filters: $filters, first: $first, after: $after, studentIds: $studentIds, orderByDirection: $orderByDirection) {
        pageInfo {
          hasNextPage
          hasPreviousPage
          startCursor
          endCursor
          __typename
        }
        totalCount
        edges {
          id
          orderDate
          itemType
          item {
            id
            ... on StudentAssignment {
              ...studentAssignmentItem
              __typename
            }
            ... on ProjectDeadline {
              ...projectDeadlineItem
              __typename
            }
            ... on ProjectTaskResponse {
              id
              mappedProject: project {
                id
                projectGroup {
                  id
                  type
                  subType
                  courses {
                    edges {
                      node {
                        id
                        __typename
                      }
                      __typename
                    }
                    __typename
                  }
                  __typename
                }
                __typename
              }
              task {
                ...projectGroupTaskItem
                __typename
              }
              latestSubmissionResponse {
                id
                status
                __typename
              }
              __typename
            }
            __typename
          }
          __typename
        }
        __typename
      }
      __typename
    }
    __typename
  }
}

fragment studentAssignmentItem on StudentAssignment {
  id
  status
  isSubmitted
  isEvaluated
  isSharedWithStudent
  isNewForStudent
  state
  conversation {
    id
    unreadMessageCount
    __typename
  }
  submission {
    id
    status
    statusV2
    __typename
  }
  assignment {
    id
    label
    contentType
    isFixedStartTime
    isStudentSubmissionEnabled
    isTeacherEvaluationEnabled
    deadline
    closeSubmissionDate
    visibility
    state {
      state
      publishedAt
      __typename
    }
    assignedStudents {
      id
      state
      __typename
    }
    course {
      id
      title
      learningCourse {
        id
        title
        academicCourse {
          id
          label
          __typename
        }
        __typename
      }
      __typename
    }
    content {
      ... on Assessment {
        id
        assessmentType {
          id
          value
          __typename
        }
        taskType {
          id
          type
          label
          __typename
        }
        title {
          id
          value
          __typename
        }
        image {
          id
          value
          __typename
        }
        __typename
      }
      ... on AssignmentResource {
        id
        label
        __typename
      }
      __typename
    }
    curriculumProgram {
      id
      curriculum {
        id
        type
        __typename
      }
      __typename
    }
    classDiscussion {
      id
      unreadMessageCount
      __typename
    }
    __typename
  }
  lockingState {
    state
    __typename
  }
  isEvaluationApplicable
  __typename
}

fragment projectDeadlineItem on ProjectDeadline {
  id
  deadline {
    id
    deadlineDate
    title
    description
    isDeadlineAllDay
    __typename
  }
  project {
    id
    projectGroup {
      id
      name
      subType
      type
      courses {
        edges {
          node {
            id
            title
            learningCourse {
              id
              title
              academicCourse {
                id
                label
                __typename
              }
              __typename
            }
            __typename
          }
          __typename
        }
        __typename
      }
      subject {
        id
        name
        type
        ibOfferedSubject {
          id
          contentSubject {
            id
            assessmentYearTitle
            __typename
          }
          __typename
        }
        __typename
      }
      __typename
    }
    fields(filters: {uids: ["title", "topic"]}) {
      id
      uid
      value
      __typename
    }
    status
    conversation {
      id
      unreadMessageCount
      __typename
    }
    __typename
  }
  __typename
}

fragment projectGroupTaskItem on ProjectGroupTask {
  id
  title
  description
  dueOn
  closesOn
  isStudentSubmissionEnabled
  submission {
    id
    type
    __typename
  }
  __typename
}`,

  USER_COURSES: `query getUserCourses($id: ID!, $type: ENTITY_TYPE_ENUM!, $filters: CourseFilter) {
  node(id: $id, type: $type) {
    id
    ... on Student {
      id
      courses(orderBy: TITLE, orderByDirection: ASC, filters: $filters) {
        id
        title
        isArchived
        isDemo
        profileImageData {
          url
          icon
          color
          __typename
        }
        curriculumProgram {
          id
          label
          __typename
        }
        academicYears {
          id
          startDate
          endDate
          isCurrentAcademicYear
          label
          __typename
        }
        __typename
      }
      __typename
    }
    __typename
  }
}`
};
