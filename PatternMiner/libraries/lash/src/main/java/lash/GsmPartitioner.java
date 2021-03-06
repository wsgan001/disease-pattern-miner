package lash;

import org.apache.hadoop.io.BytesWritable;
import org.apache.hadoop.io.IntWritable;
import org.apache.hadoop.io.WritableComparator;
import org.apache.hadoop.mapreduce.Partitioner;

import java.io.IOException;

public class GsmPartitioner extends Partitioner<BytesWritable, IntWritable> {

    @Override
    public int getPartition(BytesWritable key, IntWritable value, int numPartitions) {
        try {
            int partitionId = WritableComparator.readVInt(key.getBytes(), 0);
            return Math.abs(partitionId % numPartitions);
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }
}
