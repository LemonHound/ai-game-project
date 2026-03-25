export default function AboutPage() {
    return (
        <div className="container mx-auto max-w-3xl px-4 py-10">
            <h1 className="mb-6 text-4xl font-bold">About</h1>
            <div className="prose prose-lg">
                <p>
                    AI Game Hub is a passion project exploring adaptive AI opponents across classic games.
                    Each game features an AI that responds and adapts to your play style.
                </p>
                <p>
                    Built with FastAPI, React, and a whole lot of game theory.
                </p>
            </div>
        </div>
    );
}
