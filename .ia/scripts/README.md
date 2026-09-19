# Scripts

Scripts futuros devem ser pequenos, idempotentes e seguros para repetição.

Contrato mínimo:

1. `check` mostra o que está instalado e detecta conflitos;
2. `apply` instala apenas componentes aprovados;
3. `remove` desfaz o adaptador sem apagar estado do usuário;
4. nenhum comando imprime segredos ou depende de `~` sem resolução explícita.

A implementação dos adaptadores e do bootstrap fica nas issues RAF-113 e
RAF-114.
