interface PageMetaProps {
    title: string;
    description?: string;
    ogImage?: string;
    noindex?: boolean;
}

const SITE_NAME = 'AI Game Hub';

export default function PageMeta({ title, description, ogImage, noindex }: PageMetaProps) {
    const fullTitle = title === SITE_NAME ? title : `${title} | ${SITE_NAME}`;

    return (
        <>
            <title>{fullTitle}</title>
            {description && <meta name='description' content={description} />}
            <meta property='og:title' content={title} />
            {description && <meta property='og:description' content={description} />}
            {ogImage && <meta property='og:image' content={ogImage} />}
            <meta property='og:type' content='website' />
            {noindex && <meta name='robots' content='noindex' />}
        </>
    );
}
