"""
News Sentiment Analysis using TextBlob and FinBERT
Analyzes financial news articles for sentiment
"""

import logging
from textblob import TextBlob
from typing import Dict, List

logger = logging.getLogger(__name__)

class SentimentAnalyzer:
    """Analyze sentiment of financial news"""

    @staticmethod
    def analyze_textblob(text: str) -> Dict:
        """Analyze sentiment using TextBlob"""
        try:
            blob = TextBlob(text)
            polarity = blob.sentiment.polarity
            subjectivity = blob.sentiment.subjectivity

            # Classify sentiment
            if polarity > 0.1:
                sentiment = 'POSITIVE'
            elif polarity < -0.1:
                sentiment = 'NEGATIVE'
            else:
                sentiment = 'NEUTRAL'

            return {
                'sentiment': sentiment,
                'polarity': float(polarity),
                'subjectivity': float(subjectivity),
                'confidence': abs(polarity)
            }

        except Exception as e:
            logger.error(f"TextBlob analysis failed: {str(e)}")
            return {
                'sentiment': 'NEUTRAL',
                'polarity': 0.0,
                'subjectivity': 0.5,
                'confidence': 0.0
            }

    @staticmethod
    def analyze_finbert(text: str) -> Dict:
        """Analyze sentiment using FinBERT"""
        try:
            # Note: Requires transformers library
            from transformers import AutoTokenizer, AutoModelForSequenceClassification
            import torch

            tokenizer = AutoTokenizer.from_pretrained("ProsusAI/finbert")
            model = AutoModelForSequenceClassification.from_pretrained("ProsusAI/finbert")

            inputs = tokenizer(text, return_tensors="pt", max_length=512, truncation=True)

            with torch.no_grad():
                outputs = model(**inputs)
                probs = torch.nn.functional.softmax(outputs.logits, dim=-1)

            # Map predictions
            labels = ['negative', 'neutral', 'positive']
            predicted_idx = probs.argmax().item()
            predicted_label = labels[predicted_idx]
            confidence = probs[0][predicted_idx].item()

            sentiment_map = {
                'negative': 'NEGATIVE',
                'neutral': 'NEUTRAL',
                'positive': 'POSITIVE'
            }

            return {
                'sentiment': sentiment_map[predicted_label],
                'confidence': float(confidence),
                'scores': {
                    'negative': float(probs[0][0].item()),
                    'neutral': float(probs[0][1].item()),
                    'positive': float(probs[0][2].item())
                }
            }

        except Exception as e:
            logger.error(f"FinBERT analysis failed: {str(e)}")
            # Fallback to TextBlob
            return SentimentAnalyzer.analyze_textblob(text)

    @classmethod
    def analyze_article(cls, title: str, description: str = '', use_finbert: bool = False) -> Dict:
        """Analyze complete article"""
        # Combine title and description
        full_text = f"{title}. {description}".strip()

        if use_finbert:
            return cls.analyze_finbert(full_text)
        else:
            return cls.analyze_textblob(full_text)

    @staticmethod
    def batch_analyze(texts: List[str]) -> List[Dict]:
        """Analyze multiple texts"""
        results = []
        for text in texts:
            result = SentimentAnalyzer.analyze_textblob(text)
            results.append(result)
        return results

    @staticmethod
    def aggregate_sentiment(sentiments: List[Dict]) -> Dict:
        """Aggregate multiple sentiment analyses"""
        total = len(sentiments)
        if total == 0:
            return {
                'positive': 0,
                'negative': 0,
                'neutral': 0,
                'overall': 'NEUTRAL',
                'average_confidence': 0.0
            }

        positive = sum(1 for s in sentiments if s['sentiment'] == 'POSITIVE')
        negative = sum(1 for s in sentiments if s['sentiment'] == 'NEGATIVE')
        neutral = sum(1 for s in sentiments if s['sentiment'] == 'NEUTRAL')

        avg_confidence = sum(s.get('confidence', 0) for s in sentiments) / total

        # Determine overall sentiment
        if positive > negative + neutral:
            overall = 'POSITIVE'
        elif negative > positive + neutral:
            overall = 'NEGATIVE'
        else:
            overall = 'NEUTRAL'

        return {
            'positive': positive,
            'negative': negative,
            'neutral': neutral,
            'positive_percentage': (positive / total) * 100,
            'negative_percentage': (negative / total) * 100,
            'neutral_percentage': (neutral / total) * 100,
            'overall': overall,
            'average_confidence': avg_confidence,
            'bullish_bias': ((positive - negative) / total) * 100
        }

    @staticmethod
    def get_sentiment_color(sentiment: str) -> str:
        """Get color code for sentiment"""
        colors = {
            'POSITIVE': '#22c55e',  # Green
            'NEGATIVE': '#ef4444',  # Red
            'NEUTRAL': '#6b7280'    # Gray
        }
        return colors.get(sentiment, '#6b7280')

    @staticmethod
    def get_sentiment_emoji(sentiment: str) -> str:
        """Get emoji for sentiment"""
        emojis = {
            'POSITIVE': '📈',
            'NEGATIVE': '📉',
            'NEUTRAL': '➡️'
        }
        return emojis.get(sentiment, '❓')
