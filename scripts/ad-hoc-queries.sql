SELECT table_name FROM information_schema.tables
WHERE table_name IN ('tic_tac_toe_states', 'tic_tac_toe_games');

SELECT * FROM public.tic_tac_toe_states;
select * from public.tic_tac_toe_games;

select * from public.checkers_games;
select * from public.checkers_states;

SELECT schemaname, tablename
FROM pg_tables
WHERE tablename LIKE 'tic_tac_toe%';

SELECT proname FROM pg_proc WHERE proname LIKE '%tic_tac_toe%';