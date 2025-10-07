SELECT table_name FROM information_schema.tables

SELECT * FROM public.tic_tac_toe_states;
select * from public.tic_tac_toe_games;

select * from public.checkers_games;
select * from public.checkers_states;

select * from cleanup_abandoned_checkers_games();

delete from checkers_states where board_positions like '%RRR%'

SELECT schemaname, tablename
FROM pg_tables
WHERE tablename LIKE 'tic_tac_toe%';

SELECT proname FROM pg_proc WHERE proname LIKE '%tic_tac_toe%';

select * from games;