package app.braid.mobile.domain.time

/*
 * Os nomes de meses e dias da semana em português, uma tabela só. As telas escolhem a forma (com ponto, em maiúscula, sem
 * o "-feira") a partir dela, porque o web escreve cada texto de um jeito mas os nomes são os mesmos.
 */

/** "jan", "fev"... a forma curta, sem ponto. */
val MONTHS_SHORT: List<String> = listOf("jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez")

/** "janeiro"... em minúscula, como entra no meio de uma frase ("14 de setembro"). */
val MONTHS_LONG: List<String> =
    listOf(
        "janeiro",
        "fevereiro",
        "março",
        "abril",
        "maio",
        "junho",
        "julho",
        "agosto",
        "setembro",
        "outubro",
        "novembro",
        "dezembro",
    )

/** "Janeiro"... com a inicial maiúscula, como abre um título ("Setembro de 2026"). */
val MONTHS_TITLE: List<String> = MONTHS_LONG.map { it.replaceFirstChar(Char::uppercaseChar) }

/** "jan.", "fev."... a forma curta com ponto, das listas de documentos. */
val MONTHS_ABBREVIATED: List<String> = MONTHS_SHORT.map { "$it." }

/** De domingo a sábado (índice 0 = domingo, como a máscara da recorrência): "Domingo", "Segunda-feira"... "Sábado". */
val WEEKDAYS_LONG: List<String> = listOf("Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado")

/** "Domingo", "Segunda", "Terça"... sem o "-feira", como o seletor de recorrência escreve. */
val WEEKDAYS_PLAIN: List<String> = WEEKDAYS_LONG.map { it.removeSuffix("-feira") }

/** "dom", "seg", "ter"... três letras em minúscula. */
val WEEKDAYS_SHORT: List<String> = WEEKDAYS_PLAIN.map { it.take(3).lowercase() }
