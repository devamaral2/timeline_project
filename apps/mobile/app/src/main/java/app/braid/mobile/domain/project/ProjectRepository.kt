package app.braid.mobile.domain.project

/** Os projetos do usuário e a criação de um novo, pelo mesmo campo "Projeto" do formulário da tarefa. */
interface ProjectRepository {
    /** Os projetos do usuário (`GET /api/projects`): `diario` primeiro e os outros por nome. */
    suspend fun list(): List<Project>

    /**
     * Cria um projeto pelo nome (`POST /api/projects`). Um nome que já existe, sem distinguir maiúsculas, sobe como
     * [ProjectNameTakenException] (409); um nome vazio ou longo demais, como [InvalidProjectNameException] (400).
     */
    suspend fun create(name: String): Project
}

/** Já existe um projeto com esse nome. */
class ProjectNameTakenException(
    cause: Throwable? = null,
) : Exception("Já existe um projeto com esse nome.", cause)

/** O nome do projeto é vazio ou passa de 60 caracteres. */
class InvalidProjectNameException(
    cause: Throwable? = null,
) : Exception("O nome do projeto tem de 1 a 60 caracteres.", cause)
