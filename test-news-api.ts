
import handler from './api/ai-news.js';

const req: any = {
  query: { nocache: '1' },
  method: 'GET',
};

const res: any = {
  setHeader: (name: string, value: string) => {},
  status: (code: number) => {
    console.log(`Status: ${code}`);
    return {
      json: (data: any) => {
        console.log('Response Body:');
        console.log(JSON.stringify(data, null, 2));
      },
      end: () => {}
    };
  },
};

handler(req, res).catch(err => {
  console.error('Handler error:', err);
});
