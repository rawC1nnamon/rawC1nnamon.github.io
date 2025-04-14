---
import { getCollection } from 'astro:content';
import BlogPost from '@/layouts/BlogPost.astro';
import { render } from 'astro:content';

export async function getStaticPaths() {
  const posts = await getCollection('blog');
  
  return posts.map(post => {
    const pathParts = post.id.split('/');
    const category = pathParts.length > 1 ? pathParts[0] : 'otros';
    const slug = pathParts.pop()?.replace('.md', '');
    
    if (!slug) {
      console.error('Post no tiene slug válido:', post);
      return null;
    }
    
    return {
      params: { slug: `${category}/${slug}` },
      props: { post },
    };
  }).filter(Boolean);
}

const { post } = Astro.props;
const { Content } = await render(post);
---

<BlogPost {...post.data}>
  <Content />
</BlogPost>
