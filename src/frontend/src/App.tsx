import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import AboutPage from './pages/AboutPage';
import GamesPage from './pages/GamesPage';
import HomePage from './pages/HomePage';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingsPage';
import CheckersPage from './pages/games/CheckersPage';
import ChessPage from './pages/games/ChessPage';
import Connect4Page from './pages/games/Connect4Page';
import DotsAndBoxesPage from './pages/games/DotsAndBoxesPage';
import PongPage from './pages/games/PongPage';
import TicTacToePage from './pages/games/TicTacToePage';

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route element={<Layout />}>
                    <Route path='/' element={<HomePage />} />
                    <Route path='/games' element={<GamesPage />} />
                    <Route path='/about' element={<AboutPage />} />
                    <Route path='/profile' element={<ProfilePage />} />
                    <Route path='/settings' element={<SettingsPage />} />
                    <Route path='/game/tic-tac-toe' element={<TicTacToePage />} />
                    <Route path='/game/chess' element={<ChessPage />} />
                    <Route path='/game/checkers' element={<CheckersPage />} />
                    <Route path='/game/connect4' element={<Connect4Page />} />
                    <Route path='/game/dots-and-boxes' element={<DotsAndBoxesPage />} />
                    <Route path='/game/pong' element={<PongPage />} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
}
