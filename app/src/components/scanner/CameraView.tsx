import React, { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { CameraView as ExpoCameraView, useCameraPermissions } from 'expo-camera';

export interface CameraViewRef {
  takePhoto: () => Promise<string | null>;
}

interface CameraViewProps {
  isActive: boolean;
  children?: React.ReactNode;
}

export const CameraView = forwardRef<CameraViewRef, CameraViewProps>(
  ({ isActive, children }, ref) => {
    const cameraRef = useRef<any>(null);
    const [permission, requestPermission] = useCameraPermissions();

    useEffect(() => {
      if (!permission) return;
      if (!permission.granted) {
        requestPermission();
      }
    }, [permission, requestPermission]);

    const takePhoto = useCallback(async (): Promise<string | null> => {
      if (!cameraRef.current) return null;
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
        return photo?.uri ?? null;
      } catch {
        return null;
      }
    }, []);

    useImperativeHandle(ref, () => ({ takePhoto }), [takePhoto]);

    if (!permission || !permission.granted) {
      return (
        <View style={styles.container}>
          <Text style={styles.message}>Camera permission is required to scan appliances.</Text>
        </View>
      );
    }

    return (
      <View style={styles.container}>
        <ExpoCameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back">
          {children}
        </ExpoCameraView>
      </View>
    );
  }
);

CameraView.displayName = 'CameraView';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  message: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
