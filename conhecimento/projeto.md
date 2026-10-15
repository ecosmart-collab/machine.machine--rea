# Base de Conhecimento — app-exemplo (sandbox)

> Documento de referência para agentes autônomos (triagem, investigação, PO, arquitetura, dev, revisão, QA). Baseado exclusivamente no estado verificado do repositório em 2026-10-15. Não há README, CLAUDE.md, CI ou documentação adicional neste repositório — tudo abaixo foi inferido lendo o código-fonte diretamente.

## 1. O que é o produto

Este repositório é um **app de exemplo minimalista**, localizado em uma pasta `sandbox/`, usado presumivelmente para demonstração, testes de ferramentas ou prova de conceito — não um produto com usuários finais reais.

- **Funcionalidade implementada:** um carrinho de compras simples em memória.
  - Criar um carrinho vazio.
  - Adicionar itens ao carrinho (por SKU, preço e quantidade), com soma automática de quantidade quando o SKU já existe.
  - Calcular o total do carrinho (soma de `preço × quantidade` de cada item).
- Não há persistência, API, interface de usuário, autenticação ou integração externa. É uma única função pura de domínio ("carrinho") cobertura por um teste.
- **Para quem:** não há indicação de público-alvo real; trata-se de código de exemplo/sandbox. Tratar como tal — não assumir requisitos de produção (SLA, escala, segurança de dados de clientes reais) a menos que o usuário explicite o contrário.

## 2. Stack e arquitetura

- **Linguagem:** JavaScript puro (ES Modules — `"type": "module"` no `package.json`).
- **Runtime:** Node.js (usa `node --test`, o test runner nativo do Node ≥18).
- **Sem framework, sem banco de dados, sem build step, sem bundler, sem dependências externas** — `package.json` não declara `dependencies` nem `devDependencies`.
- **Sem CI configurado** — não há pasta `.github/workflows` nem qualquer outro pipeline no repositório.
- **Arquitetura:** trivial — um único módulo de domínio (`src/carrinho.js`) exportando funções puras, consumido por um único arquivo de teste. Não há camadas (sem controllers, sem rotas, sem DB layer).

```
package.json   → metadata do projeto e script de teste
src/           → código de produção
test/          → testes automatizados
```

Qualquer evolução arquitetural (API, persistência, etc.) ainda não existe — deverá ser desenhada do zero pelo arquiteto quando/se solicitada.

## 3. Mapa do código

| Caminho | Conteúdo |
|---|---|
| `package.json` | Nome (`app-exemplo`), versão `1.0.0`, `type: module`, script `test` → `node --test`. Sem outras scripts (sem `start`, `build`, `lint`). |
| `src/carrinho.js` | Módulo de domínio único. Exporta: `criarCarrinho()`, `adicionarItem(carrinho, { sku, preco, quantidade })`, `total(carrinho)`. |
| `test/carrinho.test.js` | Teste único usando `node:test` + `node:assert/strict`, cobrindo o fluxo de somar itens (incluindo quantidade default). |

Não existem outras pastas (`docs/`, `scripts/`, `config/`, etc.) no momento desta análise.

## 4. Convenções

- **Idioma do código:** nomes de funções, parâmetros e mensagens de erro estão em **português** (`criarCarrinho`, `adicionarItem`, `preço inválido`, `quantidade inválida`). Novas funções/erros devem manter o português para consistência.
- **Estilo:** funções arrow/function declarations curtas, sem classes, sem comentários no código-fonte (nenhum comentário presente — seguir o mesmo padrão de "código autoexplicativo").
- **Módulos:** ES Modules com `export function` nomeado (não há `export default`).
- **Tratamento de erros:** validação simples via `throw new Error('mensagem em português')` em pontos de borda (ex.: preço negativo, quantidade ≤ 0). Não há classes de erro customizadas, nem try/catch — erros propagam para o chamador.
- **Mutabilidade:** `adicionarItem` muta o objeto `carrinho` recebido (push/incremento direto) e também o retorna — padrão a respeitar se estender esse módulo.
- Não há linter, formatter ou configuração de estilo (`.eslintrc`, `.prettierrc`) no repositório — não assumir regras não verificadas.

## 5. Como testar

- **Comando:** `npm test` (executa `node --test`), requer Node.js com suporte ao test runner nativo (Node ≥ 18).
- **Local dos testes:** pasta `test/`, arquivos `*.test.js`.
- **Padrão existente:** usar `import { test } from 'node:test'` e `import assert from 'node:assert/strict'`; um `test(...)` por cenário, com `assert.equal`/`assert.throws` conforme necessário. Importar o módulo sob teste via caminho relativo (`../src/arquivo.js`).
- Não há testes de erro/validação ainda (ex.: preço negativo, quantidade inválida) — é uma lacuna de cobertura a considerar ao expandir o domínio.
- Não há CI: testes devem ser executados manualmente antes de qualquer merge/PR.

## 6. Zonas de risco

Dado o tamanho e propósito (sandbox/exemplo), os riscos são limitados, mas vale atenção a:

- **`adicionarItem` é mutável e não validada contra SKU vazio/nulo** — alterações aqui afetam diretamente o cálculo de `total`; qualquer refatoração deve manter os testes existentes passando e adicionar casos de borda (preço 0, quantidade fracionária, SKU duplicado com preços diferentes — comportamento atual ignora o novo preço).
- **Nenhuma validação de tipo** (`sku`, `preco`, `quantidade` não são verificados quanto a tipo, apenas valor) — entradas malformadas (strings, `NaN`, `undefined`) não são tratadas e podem produzir resultados incorretos silenciosamente em `total`.
- **Ausência de CI** significa que nenhum gate automático impede regressões — qualquer agente que alterar `src/carrinho.js` deve rodar `npm test` manualmente antes de considerar a tarefa concluída.
- Não há dados sensíveis, pagamento real, autenticação ou migração de banco neste repositório hoje — se uma tarefa futura introduzir qualquer um desses (ex.: checkout real, persistência, PII), tratar como zona de risco nova e aplicar validação/revisão extra, já que nada disso existe como precedente no código atual.

## 7. Glossário

- **Carrinho (`carrinho`):** objeto de domínio com a forma `{ itens: [] }`, representando uma sessão de compra em memória.
- **Item (`item`):** entrada dentro de `carrinho.itens`, com a forma `{ sku, preco, quantidade }`.
- **SKU (`sku`):** identificador único de um produto dentro do carrinho; usado para decidir se um item deve ser mesclado (quantidade somada) ou criado como nova entrada.
- **Total:** valor agregado do carrinho, calculado como a soma de `preço × quantidade` de todos os itens.

---
*Este documento deve ser atualizado sempre que a estrutura do código, convenções ou stack mudarem de forma material — ele reflete apenas o que foi verificado diretamente no repositório.*
