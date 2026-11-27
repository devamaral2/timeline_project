package app.braid.mobile.data.projects

import app.braid.mobile.domain.project.Project

fun ProjectDto.toDomain() = Project(id = id, name = name, personal = personal)
