import 'dotenv/config';

const configuredDistanceThreshold = Number(process.env.FACE_DISTANCE_THRESHOLD);

// face-api.js face descriptors use Euclidean distance; lower values are better.
export const FACE_DISTANCE_THRESHOLD = Number.isFinite(configuredDistanceThreshold)
  ? configuredDistanceThreshold
  : 0.6;
export const FACE_DUPLICATE_THRESHOLD = Number(process.env.FACE_DUPLICATE_THRESHOLD) || 0.45;

export const calculateFaceDistance = (firstDescriptor, secondDescriptor) => {
  if (!Array.isArray(firstDescriptor) || !Array.isArray(secondDescriptor)
    || firstDescriptor.length !== secondDescriptor.length) return Infinity;
  return Math.sqrt(
    firstDescriptor.reduce(
      (sum, value, index) => sum + Math.pow(value - secondDescriptor[index], 2),
      0
    )
  );
};

export const getUserFaceDescriptors = (user) => [
  ...(Array.isArray(user.faceDescriptors) ? user.faceDescriptors : []),
  user.faceDescriptor,
  user.faceEmbedding,
].filter((descriptor) => (
  Array.isArray(descriptor)
  && descriptor.length === 128
  && descriptor.every((value) => typeof value === 'number' && Number.isFinite(value))
));

export const findClosestFace = (faceDescriptor, users) => {
  return users
    .map((user) => {
      const descriptor = getUserFaceDescriptors(user)
        .filter((candidate) => candidate.length === faceDescriptor.length)
        .reduce((closest, candidate) => (
          !closest || calculateFaceDistance(faceDescriptor, candidate) < calculateFaceDistance(faceDescriptor, closest)
            ? candidate
            : closest
        ), null);
      return {
        user,
        descriptor,
        distance: descriptor ? calculateFaceDistance(faceDescriptor, descriptor) : Infinity,
      };
    })
    .filter((match) => Number.isFinite(match.distance))
    .sort((first, second) => first.distance - second.distance)[0];
};
