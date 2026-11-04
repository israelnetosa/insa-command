import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paraFala } from '../src/fala.ts';

test('texto escrito vira fala natural', () => {
  const f = paraFala(`Senhor, leitura com o pregão aberto:
- **Patrimônio** R$ 3.286,87 (caixa R$ 0,00). Dia: +R$ 9,86.
- Renda R$ 22,74/mês · próximo marco R$ 25,00 (91%).
- Destaques: BTLG11 +1,2%, BBAS3 -1,70%. PM R$ 98,45 | DY 7,8%`);
  assert.equal(f, 'Senhor, leitura com o pregão aberto. Patrimônio 3.286 reais e 87 centavos (caixa 0 reais). Dia: mais 9 reais e 86 centavos. '
    + 'Renda 22 reais e 74 centavos por mês, próximo marco 25 reais (91 por cento). '
    + 'Destaques: BTLG 11 mais 1,2 por cento, BBAS 3 menos 1,70 por cento. preço médio 98 reais e 45 centavos, dividend yield 7,8 por cento.');
});

test('limita o tamanho cortando em fim de frase', () => {
  const f = paraFala('Frase um bem comprida. '.repeat(100), 200);
  assert.ok(f.length <= 200 && f.endsWith('.'));
});

test('pedido de voz separa direção de atuação e texto falado', async () => {
  const { pedidoVoz } = await import('../src/fala.ts');
  const p = pedidoVoz('Às suas ordens, Senhor.');
  assert.match(p, /### DIRECTOR'S NOTES[\s\S]*#### TRANSCRIPT\nÀs suas ordens, Senhor\.$/);
});
