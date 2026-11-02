-- v1.1: mini-gráfico intradiário por cotação (JSON com os fechamentos de 5 em 5 min)
ALTER TABLE quotes ADD COLUMN serie TEXT;
