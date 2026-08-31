# Financeiro Pessoal v2.2.0

Painel financeiro privado com Supabase Auth e dados isolados por usuário.

## Nesta versão
- Nova área **Investimentos**.
- Posições separando principal investido de valor atual.
- Aportes registrados como transferência de patrimônio, sem virar despesa.
- Resgates registrados como transferência, sem virar receita nova.
- Rendimentos separados de aportes.
- Metas patrimoniais e associação de posições a objetivos.
- Distribuição da carteira por classe de ativo.
- Atualização de valor com snapshots para histórico patrimonial.
- Compatível com o fluxo existente de Inter, compras, benefícios e pagamentos por terceiros.

## Publicação
Substitua no GitHub Pages:
- `index.html`
- `app.js`
- `styles.css`

Depois aguarde a publicação e faça `Ctrl + F5`.

## v2.2.1 — Comprovantes e prints
- Nova entrada **Comprovante ou print** em Importar extrato.
- Aceita PDF, JPG e PNG.
- PDFs textuais são lidos no navegador; imagens usam OCR local no navegador e sempre passam por conferência.
- Detecta fluxos de Mercado Pago Cofrinho, pagamento por terceiro e cartão alimentação.
- Cofrinho: reservar = aporte, retirar = resgate, rendimento = rendimento financeiro.
- Os arquivos só são enviados ao bucket privado do Supabase depois da confirmação.

## v2.2.2 — documentos em lote

- PDF/JPG/PNG agora aceitam seleção múltipla.
- Cada documento é analisado separadamente; uma falha não bloqueia os demais.
- Cofrinho, pagamentos por terceiro, cartão alimentação e notas podem coexistir no mesmo lote.
- Movimentações já registradas do Cofrinho e cartão alimentação são verificadas antes de inserir novamente.


## v2.2.3
- Corrige leitura de prints do Cartão Alimentação por blocos de data.
- Permite editar o valor de qualquer transação sem perder a referência de origem.
- Adiciona exclusão de lançamentos não agrupados.
- Importações por imagem entram como "Precisa revisar" até validação.
- Crédito do benefício usa a categoria Benefício alimentação.


## v2.2.5
- Reconhecimento automático de extrato Mercado Pago em PDF.
- Uso do ID da operação para deduplicação.
- Pareamento de Pix recebido no Mercado Pago com saída correspondente do Inter quando houver correspondência única.
- Reserva/resgate do Cofrinho reconciliados com movimentações de investimento já existentes.
